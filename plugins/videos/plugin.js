const database = require("./database");
const accountsDatabase = require("../accounts/database");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = database.db;
const accountsDB = accountsDatabase.db;

const uploadPath = path.join(
    __dirname,
    "../../storage/videos"
);

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(
        uploadPath,
        {
            recursive: true
        }
    );
}

const storage = multer.diskStorage({

    destination(req, file, cb) {

        cb(null, uploadPath);

    },

    filename(req, file, cb) {

        cb(
            null,
            Date.now() + path.extname(file.originalname)
        );

    }

});

const upload = multer({
    storage
});


module.exports = {

    name: "Videos System",

    async activate(api) {

        await database.initDatabase();
        await accountsDatabase.initDatabase();


        // =========================================================
        // Owner Videos
        // =========================================================

        api.registerRoute(
            "/videos/owner",
            "GET",
            api.auth,

            async (req, res) => {

    try {

        await db.read();

                    const videos =
                        (db.data.videos || [])
                        .filter(
                            v =>
                                String(v.owner_id) ===
                                String(req.user.id)
                        );

                    return res.json({

                        success: true,

                        videos

                    });

                } catch (error) {

                    console.error(
                        "Videos owner error:",
                        error
                    );

                    return res.status(500).json({

    success: false,

    error: "Failed to load videos"

});

                }

            }
        );


        // =========================================================
        // Edit Video
        // =========================================================

        api.registerRoute(
            "/videos/edit/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();

                    const video =
                        (db.data.videos || [])
                        .find(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (!video) {

                        return res.json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    if (
                        String(video.owner_id) !==
                        String(req.user.id)
                    ) {

                        return res.status(403).json({

                            success: false,

                            error: "Not owner"

                        });

                    }

                    video.title =
                        req.body.title ||
                        video.title;

                    video.description =
                        req.body.description ||
                        video.description;

                    video.privacy =
                        req.body.privacy ||
                        video.privacy;

                    await db.write();

                    return res.json({

                        success: true,

                        video

                    });

                } catch (error) {

                    console.error(
                        "Video edit error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to edit video"

                    });

                }

            }
        );


        // =========================================================
        // Remove Video
        // =========================================================

        api.registerRoute(
            "/videos/remove/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();

                    const videos =
                        db.data.videos || [];

                    const index =
                        videos.findIndex(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (index === -1) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    const video =
                        videos[index];

                    if (
                        String(video.owner_id) !==
                        String(req.user.id)
                    ) {

                        return res.status(403).json({

                            success: false,

                            error: "Not owner"

                        });

                    }

                    videos.splice(index, 1);

                    await db.write();

                    return res.json({

                        success: true

                    });

                } catch (error) {

                    console.error(
                        "Video remove error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to remove video"

                    });

                }

            }
        );


        // =========================================================
        // Upload Video
        // =========================================================

        api.registerRoute(
            "/videos/upload",
            "POST",
            api.auth,
            upload.single("video"),

            async (req, res) => {

                try {

                    const {

                        title,
                        description,
                        privacy

                    } = req.body;

                    if (!req.file) {

                        return res.status(400).json({

                            success: false,

                            error: "No video file"

                        });

                    }

                    await db.read();
                    await accountsDB.read();

                    const channels =
                        accountsDB.data.channels || [];

                    const channel =
                        channels.find(
                            c =>
                                String(c.user_id) ===
                                String(req.user.id)
                        );

                    if (!channel) {

                        return res.status(403).json({

                            success: false,

                            error: "No channel found"

                        });

                    }

                    if (!Array.isArray(db.data.videos)) {

                        db.data.videos = [];

                    }

                    // Extract first video frame as thumbnail
                    const thumbnailDir =
                        path.join(
                            __dirname,
                            "../../storage/thumbnails"
                        );

                    if (!fs.existsSync(thumbnailDir)) {
                        fs.mkdirSync(
                            thumbnailDir,
                            { recursive: true }
                        );
                    }

                    const thumbnailPath =
                        path.join(
                            thumbnailDir,
                            path.basename(
                                req.file.filename,
                                path.extname(req.file.filename)
                            ) + ".jpg"
                        );

                    try {
                        const { execFile } =
                            require("child_process");

                        await new Promise((resolve, reject) => {
                            execFile(
                                "/data/data/com.termux/files/usr/bin/ffmpeg",
                                [
                                    "-y",
                                    "-i",
                                    req.file.path,
                                    "-frames:v",
                                    "1",
                                    "-q:v",
                                    "2",
                                    thumbnailPath
                                ],
                                error => {
                                    if (error) reject(error);
                                    else resolve();
                                }
                            );
                        });
                    } catch (thumbnailError) {
                        console.error(
                            "Thumbnail extraction error:",
                            thumbnailError
                        );
                    }

                    const video = {

                        id: Date.now(),

                        owner_id: req.user.id,

                        channel_id: channel.id,

                        title:
                            title ||
                            "Untitled Video",

                        description:
                            description ||
                            "",

                        file:
                            req.file.filename,

                        privacy:
                            privacy ||
                            "public",

                        type:
                            req.body.type ||
                            "normal",

                        likes: [],

                        dislikes: [],

                        views: 0,

                        created_at:
                            new Date().toISOString()

                    };

                    db.data.videos.push(video);

                    await db.write();

                    return res.json({

                        success: true,

                        message: "Video uploaded",

                        video

                    });

                } catch (error) {

                    console.error(
                        "Video upload error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to upload video"

                    });

                }

            }
        );


        // =========================================================
        // Public Videos
        // =========================================================

        api.registerRoute(
            "/videos/list",
            "GET",

            async (req, res) => {

                try {

                    await db.read();
                    await accountsDB.read();

                    const videos =
                        (db.data.videos || [])
                        .filter(
                            video =>
                                video.privacy ===
                                "public"
                        )
                        .map(video => {

                            const channel =
                                (accountsDB.data.channels || [])
                                .find(
                                    c =>
                                        String(c.id) ===
                                        String(video.channel_id)
                                );

                            return {

                                ...video,

                                channel_name:
                                    channel
                                        ? channel.name
                                        : "Unknown",

                                subscribers:
                                    channel &&
                                    Array.isArray(
                                        channel.subscribers
                                    )
                                        ? channel.subscribers.length
                                        : 0

                            };

                        });

                    return res.json(videos);

                } catch (error) {

                    console.error(
                        "Videos list error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to load videos"

                    });

                }

            }
        );

        // =========================================================
        // Watch Video
        // =========================================================

        api.registerRoute(
            "/videos/watch/:file",
            "GET",

            async (req, res) => {

                try {

                    const fileName =
                        path.basename(req.params.file);

                    const filePath =
                        path.join(
                            uploadPath,
                            fileName
                        );

                    if (!fs.existsSync(filePath)) {

                        return res.status(404).json({

                            success: false,

                            error: "Video file not found"

                        });

                    }

                    return res.sendFile(filePath);

                } catch (error) {

                    console.error(
                        "Video watch error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to load video"

                    });

                }

            }
        );

        // =========================================================
        // Channel Videos
        // =========================================================

        api.registerRoute(
            "/channels/:id/videos",
            "GET",

            async (req, res) => {

                try {

                    await db.read();

                    const videos =
                        (db.data.videos || [])
                        .filter(
                            v =>
                                String(v.channel_id) ===
                                String(req.params.id)
                                &&
                                v.privacy ===
                                "public"
                        );

                    return res.json({

                        success: true,

                        videos

                    });

                } catch (error) {

                    console.error(
                        "Channel videos error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to load channel videos"

                    });

                }

            }
        );


        // =========================================================
        // Like Video
        // =========================================================

        api.registerRoute(
            "/videos/like/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();

                    const video =
                        (db.data.videos || [])
                        .find(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (!video) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    if (!Array.isArray(video.likes)) {

                        video.likes = [];

                    }

                    if (!Array.isArray(video.dislikes)) {

                        video.dislikes = [];

                    }

                    const userId =
                        req.user.id;

                    const alreadyLiked =
                        video.likes.some(
                            id =>
                                String(id) ===
                                String(userId)
                        );

                    if (alreadyLiked) {

                        video.likes =
                            video.likes.filter(
                                id =>
                                    String(id) !==
                                    String(userId)
                            );

                    } else {

                        video.likes.push(userId);

                        video.dislikes =
                            video.dislikes.filter(
                                id =>
                                    String(id) !==
                                    String(userId)
                            );

                    }

                    await db.write();

                    return res.json({

                        success: true,

                        likes:
                            video.likes.length,

                        dislikes:
                            video.dislikes.length

                    });

                } catch (error) {

                    console.error(
                        "Video like error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to like video"

                    });

                }

            }
        );


        // =========================================================
        // Dislike Video
        // =========================================================

        api.registerRoute(
            "/videos/dislike/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();

                    const video =
                        (db.data.videos || [])
                        .find(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (!video) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    if (!Array.isArray(video.likes)) {

                        video.likes = [];

                    }

                    if (!Array.isArray(video.dislikes)) {

                        video.dislikes = [];

                    }

                    const userId =
                        req.user.id;

                    const alreadyDisliked =
                        video.dislikes.some(
                            id =>
                                String(id) ===
                                String(userId)
                        );

                    if (alreadyDisliked) {

                        video.dislikes =
                            video.dislikes.filter(
                                id =>
                                    String(id) !==
                                    String(userId)
                            );

                    } else {

                        video.dislikes.push(userId);

                        video.likes =
                            video.likes.filter(
                                id =>
                                    String(id) !==
                                    String(userId)
                            );

                    }

                    await db.write();

                    return res.json({

                        success: true,

                        likes:
                            video.likes.length,

                        dislikes:
                            video.dislikes.length

                    });

                } catch (error) {

                    console.error(
                        "Video dislike error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to dislike video"

                    });

                }

            }
        );


        // =========================================================
        // My Videos
        // =========================================================

        api.registerRoute(
            "/videos/my",
            "GET",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();
                    await accountsDB.read();

                    const channels =
                        (accountsDB.data.channels || [])
                        .filter(
                            c =>
                                String(c.user_id) ===
                                String(req.user.id)
                        );

                    const ids =
                        channels.map(
                            c =>
                                String(c.id)
                        );

                    const videos =
                        (db.data.videos || [])
                        .filter(
                            v =>
                                ids.includes(
                                    String(v.channel_id)
                                )
                        );

                    return res.json({

                        success: true,

                        videos

                    });

                } catch (error) {

                    console.error(
                        "My videos error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to load my videos"

                    });

                }

            }
        );


        // =========================================================
        // Update Video
        // =========================================================

        api.registerRoute(
            "/videos/update/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();
                    await accountsDB.read();

                    const video =
                        (db.data.videos || [])
                        .find(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (!video) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    const channel =
                        (accountsDB.data.channels || [])
                        .find(
                            c =>
                                String(c.id) ===
                                String(video.channel_id)
                                &&
                                String(c.user_id) ===
                                String(req.user.id)
                        );

                    if (!channel) {

                        return res.status(403).json({

                            success: false,

                            error: "No permission"

                        });

                    }

                    video.title =
                        req.body.title ||
                        video.title;

                    video.description =
                        req.body.description ||
                        video.description;

                    video.privacy =
                        req.body.privacy ||
                        video.privacy;

                    await db.write();

                    return res.json({

                        success: true,

                        video

                    });

                } catch (error) {

                    console.error(
                        "Video update error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to update video"

                    });

                }

            }
        );


        // =========================================================
        // Delete Video
        // =========================================================

        api.registerRoute(
            "/videos/delete/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();
                    await accountsDB.read();

                    const videos =
                        db.data.videos || [];

                    const index =
                        videos.findIndex(
                            v =>
                                String(v.id) ===
                                String(req.params.id)
                        );

                    if (index === -1) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    const video =
                        videos[index];

                    const channel =
                        (accountsDB.data.channels || [])
                        .find(
                            c =>
                                String(c.id) ===
                                String(video.channel_id)
                                &&
                                String(c.user_id) ===
                                String(req.user.id)
                        );

                    if (!channel) {

                        return res.status(403).json({

                            success: false,

                            error: "No permission"

                        });

                    }

                    if (video.file) {

                        const file =
                            path.join(
                                uploadPath,
                                video.file
                            );

                        if (fs.existsSync(file)) {

                            fs.unlinkSync(file);

                        }

                    }

                    videos.splice(index, 1);

                    await db.write();

                    return res.json({

                        success: true,

                        message: "Video deleted"

                    });

                } catch (error) {

                    console.error(
                        "Video delete error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to delete video"

                    });

                }

            }
        );


        // =========================================================
        // Search Videos
        // =========================================================

        api.registerRoute(
            "/videos/search",
            "GET",

            async (req, res) => {

                try {

                    await db.read();
                    await accountsDB.read();

                    const query =
                        String(
                            req.query.q || ""
                        )
                        .trim()
                        .toLowerCase();

                    if (!query) {

                        return res.json({

                            success: true,

                            videos: []

                        });

                    }

                    const videos =
                        (db.data.videos || [])
                        .filter(
                            video => {

                                if (
                                    video.privacy !==
                                    "public"
                                ) {

                                    return false;

                                }

                                const title =
                                    String(
                                        video.title || ""
                                    )
                                    .toLowerCase();

                                const description =
                                    String(
                                        video.description || ""
                                    )
                                    .toLowerCase();

                                const channel =
                                    (accountsDB.data.channels || [])
                                    .find(
                                        c =>
                                            String(c.id) ===
                                            String(video.channel_id)
                                    );

                                const channelName =
                                    String(
                                        channel
                                            ? channel.name
                                            : ""
                                    )
                                    .toLowerCase();

                                return (
                                    title.includes(query)
                                    ||
                                    description.includes(query)
                                    ||
                                    channelName.includes(query)
                                );

                            }
                        )
                        .map(video => {

                            const channel =
                                (accountsDB.data.channels || [])
                                .find(
                                    c =>
                                        String(c.id) ===
                                        String(video.channel_id)
                                );

                            return {

                                ...video,

                                channel_name:
                                    channel
                                        ? channel.name
                                        : "Unknown",

                                subscribers:
                                    channel &&
                                    Array.isArray(
                                        channel.subscribers
                                    )
                                        ? channel.subscribers.length
                                        : 0

                            };

                        });

                    return res.json({

                        success: true,

                        videos

                    });

                } catch (error) {

                    console.error(
                        "Video search error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to search videos"

                    });

                }

            }
        );


        // =========================================================
        // Comments - GET
        // =========================================================

        api.registerRoute(
            "/videos/comments/:id",
            "GET",

            async (req, res) => {

                try {

                    await db.read();

                    const videoId =
                        String(
                            req.params.id
                        );

                    const video =
                        (db.data.videos || [])
                        .find(
                            video =>
                                String(video.id) ===
                                videoId
                        );

                    if (!video) {

                        return res.status(404).json({

                            success: false,

                            error: "Video not found"

                        });

                    }

                    const comments =
                        (db.data.comments || [])
                        .filter(
                            comment =>
                                String(
                                    comment.video_id
                                ) === videoId
                        )
                        .sort(
                            (a, b) =>
                                new Date(
                                    a.created_at
                                ) -
                                new Date(
                                    b.created_at
                                )
                        )
                        .map(
                            comment => ({

                                ...comment,

                                video_owner_id:
                                    video.owner_id

                            })
                        );

                    return res.json({

                        success: true,

                        comments

                    });

                } catch (error) {

                    console.error(
                        "Comments GET Error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error:
                            "Failed to load comments"

                    });

                }

            }
        );


        // =========================================================
        // Comments - POST
        // =========================================================

                api.registerRoute(
            "/videos/comments/:id",
            "POST",
            api.auth,

            async (req, res) => {

                try {

                    await db.read();

                    if (
                        !req.body ||
                        typeof req.body.text !== "string"
                    ) {

                        return res.status(400).json({
                            success: false,
                            error: "Comment text is required"
                        });

                    }

                    const text =
                        req.body.text.trim();

                    if (!text) {

                        return res.status(400).json({
                            success: false,
                            error: "Comment cannot be empty"
                        });

                    }

                    if (text.length > 1000) {

                        return res.status(400).json({
                            success: false,
                            error: "Comment is too long"
                        });

                    }

                    const videoId =
                        String(req.params.id);

                    const video =
                        (db.data.videos || [])
                        .find(
                            v =>
                                String(v.id) === videoId
                        );

                    if (!video) {

                        return res.status(404).json({
                            success: false,
                            error: "Video not found"
                        });

                    }

                    if (!Array.isArray(db.data.comments)) {

                        db.data.comments = [];

                    }

                    const comment = {

                        id:
                            Date.now().toString(),

                        video_id:
                            videoId,

                        user_id:
                            req.user.id,

                        username:
                            req.user.username ||
                            "User",

                        text:
                            text,

                        created_at:
                            new Date().toISOString()

                    };

                    db.data.comments.push(comment);

                    await db.write();

                    return res.json({

                        success: true,

                        comment: comment

                    });

                } catch (error) {

                    console.error(
                        "Comments POST Error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error: "Failed to add comment"

                    });

                }

            }
        );


    // =========================================================
    // Update Video
    // =========================================================

    api.registerRoute(
        "/videos/update/:id",
        "POST",
        api.auth,

        async (req, res) => {

            try {

                await db.read();
                await accountsDB.read();

                const video =
                    (db.data.videos || [])
                    .find(
                        v =>
                            String(v.id) ===
                            String(req.params.id)
                    );

                if (!video) {

                    return res.status(404).json({

                        success: false,

                        error: "Video not found"

                    });

                }

                const channel =
                    (accountsDB.data.channels || [])
                    .find(
                        c =>
                            String(c.id) ===
                            String(video.channel_id) &&
                            String(c.user_id) ===
                            String(req.user.id)
                    );

                if (!channel) {

                    return res.status(403).json({

                        success: false,

                        error: "No permission"

                    });

                }

                if (
                    typeof req.body.title === "string" &&
                    req.body.title.trim()
                ) {

                    video.title =
                        req.body.title.trim();

                }

                if (
                    typeof req.body.description === "string"
                ) {

                    video.description =
                        req.body.description;

                }

                if (
                    typeof req.body.privacy === "string" &&
                    req.body.privacy.trim()
                ) {

                    video.privacy =
                        req.body.privacy.trim();

                }

                await db.write();

                return res.json({

                    success: true,

                    video

                });

            } catch (error) {

                console.error(
                    "Video update error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error: "Failed to update video"

                });

            }

        }

    );


    // =========================================================
    // Delete Video
    // =========================================================

    api.registerRoute(
        "/videos/delete/:id",
        "POST",
        api.auth,

        async (req, res) => {

            try {

                await db.read();
                await accountsDB.read();

                const videos =
                    db.data.videos || [];

                const index =
                    videos.findIndex(
                        v =>
                            String(v.id) ===
                            String(req.params.id)
                    );

                if (index === -1) {

                    return res.status(404).json({

                        success: false,

                        error: "Video not found"

                    });

                }

                const video =
                    videos[index];

                const channel =
                    (accountsDB.data.channels || [])
                    .find(
                        c =>
                            String(c.id) ===
                            String(video.channel_id) &&
                            String(c.user_id) ===
                            String(req.user.id)
                    );

                if (!channel) {

                    return res.status(403).json({

                        success: false,

                        error: "No permission"

                    });

                }

                if (video.file) {

                    const filePath =
                        path.join(
                            uploadPath,
                            video.file
                        );

                    if (
                        fs.existsSync(filePath)
                    ) {

                        fs.unlinkSync(filePath);

                    }

                }

                videos.splice(index, 1);

                await db.write();

                return res.json({

                    success: true,

                    message: "Video deleted"

                });

            } catch (error) {

                console.error(
                    "Video delete error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error: "Failed to delete video"

                });

            }

        }

    );


    // =========================================================
    // Search Videos
    // =========================================================

    api.registerRoute(
        "/videos/search",
        "GET",

        async (req, res) => {

            try {

                await db.read();
                await accountsDB.read();

                const query =
                    String(
                        req.query.q || ""
                    )
                    .trim()
                    .toLowerCase();

                if (!query) {

                    return res.json({

                        success: true,

                        videos: []

                    });

                }

                const channels =
                    accountsDB.data.channels || [];

                const videos =
                    (db.data.videos || [])
                    .filter(
                        video =>
                            video.privacy === "public"
                    )
                    .filter(video => {

                        const title =
                            String(
                                video.title || ""
                            )
                            .toLowerCase();

                        const description =
                            String(
                                video.description || ""
                            )
                            .toLowerCase();

                        const channel =
                            channels.find(
                                c =>
                                    String(c.id) ===
                                    String(video.channel_id)
                            );

                        const channelName =
                            String(
                                channel
                                    ? channel.name
                                    : ""
                            )
                            .toLowerCase();

                        return (
                            title.includes(query) ||
                            description.includes(query) ||
                            channelName.includes(query)
                        );

                    })
                    .map(video => {

                        const channel =
                            channels.find(
                                c =>
                                    String(c.id) ===
                                    String(video.channel_id)
                            );

                        return {

                            ...video,

                            channel_name:
                                channel
                                    ? channel.name
                                    : "Unknown",

                            subscribers:
                                channel &&
                                Array.isArray(
                                    channel.subscribers
                                )
                                    ? channel.subscribers.length
                                    : 0

                        };

                    });

                return res.json({

                    success: true,

                    videos

                });

            } catch (error) {

                console.error(
                    "Video search error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error: "Failed to search videos"

                });

            }

        }

    );


    // =========================================================
    // Get Comments
    // =========================================================

    api.registerRoute(
        "/videos/comments/:id",
        "GET",

        async (req, res) => {

            try {

                await db.read();

                const videoId =
                    String(req.params.id);

                const video =
                    (db.data.videos || [])
                    .find(
                        v =>
                            String(v.id) ===
                            videoId
                    );

                if (!video) {

                    return res.status(404).json({

                        success: false,

                        error: "Video not found"

                    });

                }

                const comments =
                    Array.isArray(
                        db.data.comments
                    )
                        ? db.data.comments
                            .filter(
                                comment =>
                                    String(
                                        comment.video_id
                                    ) === videoId
                            )
                            .sort(
                                (a, b) =>
                                    new Date(
                                        a.created_at
                                    ).getTime() -
                                    new Date(
                                        b.created_at
                                    ).getTime()
                            )
                            .map(comment => ({

                                ...comment,

                                video_owner_id:
                                    video.owner_id

                            }))
                        : [];

                return res.json({

                    success: true,

                    comments

                });

            } catch (error) {

                console.error(
                    "Comments GET Error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error: "Failed to load comments"

                });

            }

        }

    );


    // =========================================================
    // Add Comment
    // =========================================================

    api.registerRoute(
        "/videos/comments/:id",
        "POST",
        api.auth,

        async (req, res) => {

            try {

                await db.read();

                if (
                    !req.body ||
                    typeof req.body.text !== "string"
                ) {

                    return res.status(400).json({

                        success: false,

                        error: "Comment text is required"

                    });

                }

                const text =
                    req.body.text.trim();

                if (!text) {

                    return res.status(400).json({

                        success: false,

                        error: "Comment cannot be empty"

                    });

                }

                if (text.length > 1000) {

                    return res.status(400).json({

                        success: false,

                        error: "Comment is too long"

                    });

                }

                const videoId =
                    String(req.params.id);

                const video =
                    (db.data.videos || [])
                    .find(
                        v =>
                            String(v.id) ===
                            videoId
                    );

                if (!video) {

                    return res.status(404).json({

                        success: false,

                        error: "Video not found"

                    });

                }

                if (
                    !Array.isArray(
                        db.data.comments
                    )
                ) {

                    db.data.comments = [];

                }

                const comment = {

                    id:
                        Date.now().toString(),

                    video_id:
                        videoId,

                    user_id:
                        req.user.id,

                    username:
                        req.user.username ||
                        "User",

                    text,

                    created_at:
                        new Date().toISOString()

                };

                db.data.comments.push(
                    comment
                );

                await db.write();

                return res.json({

                    success: true,

                    comment

                });

            } catch (error) {

                console.error(
                    "Comments POST Error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error: "Failed to add comment"

                });

            }

        }

    );


    // =========================================================
    // Edit Comment
    // =========================================================

    api.registerRoute(
        "/videos/comments/:commentId/edit",
        "POST",
        api.auth,
        async (req, res) => {
            try {
                await db.read();

                const comments = Array.isArray(db.data.comments)
                    ? db.data.comments
                    : [];

                const comment = comments.find(
                    item => String(item.id) === String(req.params.commentId)
                );

                if (!comment) {
                    return res.status(404).json({
                        success: false,
                        error: "Comment not found"
                    });
                }

                if (String(comment.user_id) !== String(req.user.id)) {
                    return res.status(403).json({
                        success: false,
                        error: "No permission"
                    });
                }

                if (!req.body || typeof req.body.text !== "string") {
                    return res.status(400).json({
                        success: false,
                        error: "Comment text is required"
                    });
                }

                const text = req.body.text.trim();

                // The existing comments page uses an empty value to request deletion.
                if (!text) {
                    db.data.comments = comments.filter(
                        item => String(item.id) !== String(req.params.commentId)
                    );
                    await db.write();

                    return res.json({
                        success: true,
                        removed: true
                    });
                }

                if (text.length > 1000) {
                    return res.status(400).json({
                        success: false,
                        error: "Comment is too long"
                    });
                }

                comment.text = text;
                comment.updated_at = new Date().toISOString();

                await db.write();

                return res.json({
                    success: true,
                    removed: false,
                    comment
                });
            } catch (error) {
                console.error("Comment edit error:", error);
                return res.status(500).json({
                    success: false,
                    error: "Failed to update comment"
                });
            }
        }
    );


    // =========================================================
    // Delete Comment
    // =========================================================

    api.registerRoute(
    "/videos/comments/:commentId",
    "DELETE",
    api.auth,

    async (req, res) => {

        try {

            await db.read();

            const commentId =
                String(req.params.commentId);

            const comments =
                Array.isArray(db.data.comments)
                    ? db.data.comments
                    : [];

            const index =
                comments.findIndex(
                    comment =>
                        String(comment.id) ===
                        commentId
                );

            if (index === -1) {

                return res.status(404).json({

                    success: false,

                    error: "Comment not found"

                });

            }

            const comment =
                comments[index];

            const userId =
                String(req.user.id);

            const commentOwner =
                String(comment.user_id) ===
                userId;

            if (!commentOwner) {

                return res.status(403).json({

                    success: false,

                    error: "No permission"

                });

            }

            comments.splice(index, 1);

            db.data.comments =
                comments;

            await db.write();

            return res.json({

                success: true,

                message: "Comment deleted"

            });

        } catch (error) {

            console.error(
                "Comments DELETE Error:",
                error
            );

            return res.status(500).json({

                success: false,

                error: "Failed to delete comment"

            });

        }

    }
);


    // =========================================================
    // Plugin Finished
    // =========================================================

    console.log(
        "Videos System activated successfully"
    );

}

};