const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { spawn } = require("child_process");

const PluginManager = require("./core/plugin_manager");
const EventManager = require("./core/events/event_manager");


// ===============================
// Python Agent
// ===============================

// Zeroconf agent disabled: UDP Discovery is used instead.
// const agent = spawn("python", ["agent.py"], {
//     stdio: "inherit"
// });


// ===============================
// Express
// ===============================

const app = express();

// ===============================
// LAN Discovery (mDNS)
// ===============================
require("./core/discovery");


app.use(express.json());


// ===============================
// Events
// ===============================

const events = new EventManager();


// ===============================
// JWT
// ===============================

const JWT_SECRET = "VideoPlatformSecretKey";


// ===============================
// API
// ===============================

const api = {

    registerRoute(route, method, ...handlers){

        if(method === "GET"){

            app.get(
                route,
                ...handlers
            );

        }

        if(method === "POST"){

            app.post(
                route,
                ...handlers
            );

        }

    },


    addPage(folder){

        const pagePath = path.join(
            __dirname,
            "plugins",
            folder,
            "frontend"
        );

        app.use(
            "/" + folder,
            express.static(pagePath)
        );

    },


    auth(req, res, next){

        const header =
            req.headers.authorization;

        if(!header){

            return res.status(401).json({

                success:false,

                error:"Missing token"

            });

        }


        const token =
            header.replace(
                "Bearer ",
                ""
            );


        try{

            const user =
                jwt.verify(
                    token,
                    JWT_SECRET
                );


            req.user = user;

            next();


        }catch(error){

            return res.status(401).json({

                success:false,

                error:"Invalid token"

            });

        }

    },


    jwt: jwt,

    jwtSecret: JWT_SECRET,

    events: events

};


// ===============================
// Plugin Manager
// ===============================

// Socket.IO shared by the live-streaming plugin
const httpServer = require("http").createServer(app);
const liveSocketServer = new (require("socket.io").Server)(httpServer, {
    cors: { origin: false },
    serveClient: true
});

// Expose Socket.IO to plugins before they are activated.
api.io = liveSocketServer;

const pluginManager =
    new PluginManager(api);


pluginManager.loadPlugins();


// ===============================
// Home Page
// ===============================

app.get("/", (req, res)=>{

    res.sendFile(
        path.join(
            __dirname,
            "plugins/web/frontend/index.html"
        )
    );

});


// ===============================
// Uploads
// ===============================

app.use(
    "/uploads",
    express.static(
        path.join(
            __dirname,
            "uploads"
        )
    )
);


// ===============================
// Video Thumbnails
// ===============================

app.use(
    "/thumbnails",
    express.static(
        path.join(
            __dirname,
            "storage/thumbnails"
        )
    )
);


// ===============================
// Web Frontend
// ===============================

app.use(
    express.static(
        path.join(
            __dirname,
            "plugins/web/frontend"
        )
    )
);


// ===============================
// Nginx + HTTP Server
// ===============================

const { execFileSync } = require("child_process");

const nginxConfig = path.join(
    process.env.HOME,
    "itube-https",
    "nginx-https.conf"
);

let nginxStartedByThisProcess = false;
let shuttingDown = false;
let server = null;


function ensureITubeCertificate() {
    const fs = require("fs");
    const os = require("os");

    const dir = path.join(process.env.HOME, "itube-https");
    const cert = path.join(dir, "server.crt");
    const key = path.join(dir, "server.key");

    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    // ابحث عن عنوان IPv4 محلي غير عنوان loopback.
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const entries of Object.values(interfaces)) {
        for (const item of (entries || [])) {
            if (
                item.family === "IPv4" &&
                !item.internal &&
                !item.address.startsWith("169.254.")
            ) {
                candidates.push(item.address);
            }
        }
    }

    const ip = candidates.find(a =>
        /^10\./.test(a) ||
        /^192\.168\./.test(a) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a)
    ) || candidates[0];

    if (!ip) {
        throw new Error(
            "لم أجد عنوان IPv4 للشبكة. اتصل بشبكة Wi-Fi ثم أعد التشغيل."
        );
    }

    let valid = false;

    if (fs.existsSync(cert) && fs.existsSync(key)) {
        try {
            const san = execFileSync(
                "openssl",
                ["x509", "-in", cert, "-noout", "-ext", "subjectAltName"],
                { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            );

            execFileSync(
                "openssl",
                ["x509", "-in", cert, "-checkend", "86400", "-noout"],
                { stdio: "ignore" }
            );

            // لا نحتفظ بالشهادة إن لم تتضمن IP الشبكة الحالية.
            valid = san.includes("IP Address:" + ip);
        } catch (_) {
            valid = false;
        }
    }

    if (valid) {
        console.log("HTTPS certificate is valid for " + ip + "; reusing it.");
        return false;
    }

    console.log("Creating/updating HTTPS certificate for " + ip + "...");

    // أنشئ الملفات المؤقتة أولًا حتى لا نمسح الشهادة القديمة قبل نجاح الإنشاء.
    const newCert = cert + ".new";
    const newKey = key + ".new";

    try {
        execFileSync("openssl", [
            "req", "-x509", "-nodes",
            "-newkey", "rsa:2048",
            "-days", "365",
            "-keyout", newKey,
            "-out", newCert,
            "-subj", "/CN=" + ip,
            "-addext",
            "subjectAltName=IP:" + ip + ",IP:127.0.0.1,DNS:localhost"
        ], { stdio: "inherit" });

        fs.chmodSync(newKey, 0o600);
        fs.chmodSync(newCert, 0o644);
        fs.renameSync(newKey, key);
        fs.renameSync(newCert, cert);

        console.log("HTTPS certificate created for " + ip + ".");
        return true;
    } catch (error) {
        try { fs.unlinkSync(newCert); } catch (_) {}
        try { fs.unlinkSync(newKey); } catch (_) {}
        throw error;
    }
}

function startNginx() {
    try {
        const fs = require("fs");
        const certChanged = ensureITubeCertificate();

        const pidFile = path.join(
            process.env.HOME, "itube-https", "nginx.pid"
        );

        if (fs.existsSync(pidFile)) {
            const pid = Number(fs.readFileSync(pidFile, "utf8").trim());

            if (Number.isInteger(pid) && pid > 1) {
                try {
                    process.kill(pid, 0);

                    if (certChanged) {
                        execFileSync(
                            "nginx",
                            ["-t", "-c", nginxConfig],
                            { stdio: "inherit" }
                        );
                        execFileSync(
                            "nginx",
                            ["-c", nginxConfig, "-s", "reload"],
                            { stdio: "inherit" }
                        );
                        console.log("Existing Nginx reloaded with the updated certificate.");
                    } else {
                        console.log("Nginx is already running; reusing it.");
                    }
                    return;
                } catch (error) {
                    if (error.code === "ESRCH") {
                        fs.unlinkSync(pidFile);
                    } else {
                        throw error;
                    }
                }
            } else {
                fs.unlinkSync(pidFile);
            }
        }

        execFileSync("nginx", ["-t", "-c", nginxConfig], {
            stdio: "inherit"
        });

        execFileSync("nginx", ["-c", nginxConfig], {
            stdio: "inherit"
        });

        nginxStartedByThisProcess = true;
        console.log("Nginx HTTPS started on port 8443.");
    } catch (error) {
        console.error("Failed to prepare HTTPS/Nginx:", error.message);
        process.exit(1);
    }
}

function stopManagedNginx() {
    if (!nginxStartedByThisProcess) return;

    try {
        execFileSync("nginx", ["-c", nginxConfig, "-s", "quit"], {
            stdio: "inherit"
        });
        console.log("Nginx stopped.");
    } catch (error) {
        console.error("Could not stop managed Nginx:", error.message);
    }
}

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("Stopping i.Tube...");

    try {
        if (typeof agent !== "undefined" && agent && !agent.killed) {
            agent.kill("SIGINT");
        }
    } catch (error) {
        console.log("Agent shutdown error:", error.message);
    }

    const finish = () => {
        stopManagedNginx();
        console.log("i.Tube server stopped");
        process.exit(0);
    };

    if (server && server.listening) {
        server.close(finish);
        // Avoid waiting forever for lingering connections.
        setTimeout(finish, 3000).unref();
    } else {
        finish();
    }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startNginx();

server = httpServer.listen(5900, "0.0.0.0", () => {
    console.log("Server running on port 5900");
});
