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
// HTTP Server
// ===============================

const server =
    app.listen(
        5900,
        "0.0.0.0",
        ()=>{

            console.log(
                "Server running on port 5900"
            );

        }
    );


// ===============================
// Graceful Shutdown
// ===============================

function shutdown(){

    console.log(
        "Stopping i.Tube..."
    );


    // إيقاف Python Agent

    try{

        if(typeof agent !== "undefined" && agent && !agent.killed){

            agent.kill("SIGINT");

        }

    }catch(error){

        console.log(
            "Agent shutdown error:",
            error.message
        );

    }


    // إيقاف HTTP server

    server.close(() => {

        console.log(
            "i.Tube server stopped"
        );

        process.exit(0);

    });

}


// ===============================
// Shutdown Signals
// ===============================

process.on(
    "SIGINT",
    shutdown
);


process.on(
    "SIGTERM",
    shutdown
);
