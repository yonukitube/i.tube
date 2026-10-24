const crypto = require("crypto");
const accountsDatabase = require("../accounts/database");

const streams = new Map();

function publicStream(s) {
    return {
        id: s.id,
        title: s.title,
        channelId: s.channelId,
        channelName: s.channelName,
        mode: s.mode,
        createdAt: s.createdAt,
        live: Boolean(s.hostSocketId)
    };
}

module.exports = {
    name: "Live Streaming",

    async activate(api) {
        await accountsDatabase.initDatabase();

        api.registerRoute("/live/streams", "GET", async (_req, res) => {
            res.json({
                success: true,
                streams: [...streams.values()].map(publicStream)
            });
        });

        api.registerRoute("/live/create", "POST", api.auth, async (req, res) => {
            try {
                await accountsDatabase.db.read();

                const data = accountsDatabase.db.data || {};
                const channel = (data.channels || []).find(
                    c => String(c.user_id) === String(req.user.id)
                );

                if (!channel) {
                    return res.status(404).json({
                        success: false,
                        error: "Create a channel before starting a live stream."
                    });
                }

                const title = String(req.body.title || "").trim();
                const mode = req.body.mode;

                if (!title) {
                    return res.status(400).json({
                        success: false,
                        error: "Enter a stream title."
                    });
                }

                if (!["camera", "screen"].includes(mode)) {
                    return res.status(400).json({
                        success: false,
                        error: "Choose camera or screen sharing."
                    });
                }

                const stream = {
                    id: crypto.randomUUID(),
                    ownerId: String(req.user.id),
                    channelId: channel.id,
                    channelName: channel.name || "i.Tube Creator",
                    title: title.slice(0, 100),
                    mode,
                    createdAt: new Date().toISOString(),
                    hostSocketId: null,
                    chat: []
                };

                streams.set(stream.id, stream);
                res.json({ success: true, stream: publicStream(stream) });
            } catch (e) {
                console.error("Live create:", e);
                res.status(500).json({
                    success: false,
                    error: "Could not create live stream."
                });
            }
        });

        api.registerRoute("/live/:id/end", "POST", api.auth, (req, res) => {
            const s = streams.get(req.params.id);

            if (!s) {
                return res.status(404).json({
                    success: false,
                    error: "Live stream not found."
                });
            }

            if (s.ownerId !== String(req.user.id)) {
                return res.status(403).json({
                    success: false,
                    error: "You cannot end another creator's stream."
                });
            }

            api.io.to("live:" + s.id).emit("live-ended", { id: s.id });
            streams.delete(s.id);
            res.json({ success: true });
        });

        if (!api.io) {
            throw new Error("Socket.IO is not available.");
        }

        api.io.use((socket, next) => {
            const token = socket.handshake.auth?.token;

            if (!token) {
                socket.user = null;
                return next();
            }

            try {
                socket.user = api.jwt.verify(token, api.jwtSecret);
                next();
            } catch (_) {
                next(new Error("Invalid login token"));
            }
        });

        api.io.on("connection", socket => {
            socket.data.role = null;
            socket.data.streamId = null;
            socket.data.lastChat = 0;

            socket.on("host-join", (payload, ack) => {
                const reply = typeof ack === "function" ? ack : () => {};
                const s = streams.get(String(payload?.streamId || ""));

                if (!socket.user || !s ||
                    s.ownerId !== String(socket.user.id)) {
                    return reply({
                        success: false,
                        error: "You are not allowed to host this stream."
                    });
                }

                s.hostSocketId = socket.id;
                socket.data.role = "host";
                socket.data.streamId = s.id;
                socket.join("live:" + s.id);

                api.io.to("live:" + s.id).emit("stream-status", {
                    id: s.id,
                    live: true
                });

                reply({ success: true });
            });

            socket.on("viewer-join", (payload, ack) => {
                const reply = typeof ack === "function" ? ack : () => {};
                const s = streams.get(String(payload?.streamId || ""));

                if (!s) {
                    return reply({
                        success: false,
                        error: "This live stream has ended."
                    });
                }

                if (socket.data.role === "host") {
                    return reply({
                        success: false,
                        error: "The host cannot join as a viewer."
                    });
                }

                socket.data.role = "viewer";
                socket.data.streamId = s.id;
                socket.join("live:" + s.id);

                reply({
                    success: true,
                    stream: publicStream(s),
                    hostSocketId: s.hostSocketId || null,
                    chat: Array.isArray(s.chat) ? s.chat.slice(-150) : []
                });
            });
            socket.on("leave-stream", payload => {
                const id = String(payload?.streamId || "");
                if (socket.data.role !== "viewer" ||
                    socket.data.streamId !== id) return;

                socket.leave("live:" + id);
                socket.data.role = null;
                socket.data.streamId = null;
            });

            socket.on("rtc-offer", payload => {
                const s = streams.get(String(socket.data.streamId || ""));

                if (!s || socket.data.role !== "viewer" ||
                    !s.hostSocketId ||
                    String(payload?.targetSocketId) !== s.hostSocketId ||
                    !payload.description) return;

                api.io.to(s.hostSocketId).emit("rtc-offer", {
                    streamId: s.id,
                    fromSocketId: socket.id,
                    description: payload.description
                });
            });

            socket.on("rtc-answer", payload => {
                const s = streams.get(String(socket.data.streamId || ""));
                const targetId = String(payload?.targetSocketId || "");

                if (!s || socket.data.role !== "host" ||
                    s.hostSocketId !== socket.id ||
                    !payload.description) return;

                const target = api.io.sockets.sockets.get(targetId);

                if (!target || target.data.role !== "viewer" ||
                    target.data.streamId !== s.id) return;

                target.emit("rtc-answer", {
                    streamId: s.id,
                    description: payload.description
                });
            });

            socket.on("rtc-ice", payload => {
                const s = streams.get(String(socket.data.streamId || ""));
                const target = api.io.sockets.sockets.get(
                    String(payload?.targetSocketId || "")
                );

                if (!s || !target || !payload.candidate ||
                    target.data.streamId !== s.id) return;

                if (socket.data.role === "host") {
                    if (s.hostSocketId !== socket.id ||
                        target.data.role !== "viewer") return;
                } else if (socket.data.role === "viewer") {
                    if (target.id !== s.hostSocketId) return;
                } else {
                    return;
                }

                target.emit("rtc-ice", {
                    streamId: s.id,
                    fromSocketId: socket.id,
                    candidate: payload.candidate
                });
            });

            socket.on("chat-message", payload => {
                const id = String(payload?.streamId || "");
                const s = streams.get(id);

                if (!s || socket.data.streamId !== id ||
                    !["host", "viewer"].includes(socket.data.role)) return;

                const now = Date.now();
                if (now - socket.data.lastChat < 400) return;

                const message = String(payload?.message || "")
                    .trim().slice(0, 500);

                if (!message) return;

                socket.data.lastChat = now;

                const chatItem = {
                    streamId: id,
                    username: String(socket.user?.username || "Guest").slice(0, 60),
                    message,
                    sentAt: new Date().toISOString()
                };

                if (!Array.isArray(s.chat)) s.chat = [];
                s.chat.push(chatItem);
                if (s.chat.length > 150) s.chat.shift();

                api.io.to("live:" + id).emit("chat-message", chatItem);
            });

            socket.on("disconnect", () => {
                const s = streams.get(socket.data.streamId);

                if (s && socket.data.role === "host" &&
                    s.hostSocketId === socket.id) {
                    s.hostSocketId = null;
                    api.io.to("live:" + s.id).emit("live-ended", {
                        id: s.id,
                        reason: "Host disconnected"
                    });
                    api.io.to("live:" + s.id).emit("stream-status", {
                        id: s.id,
                        live: false
                    });
                    streams.delete(s.id);
                }
            });
        });

        console.log("Live Streaming plugin loaded.");
    }
};
