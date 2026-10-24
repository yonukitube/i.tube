#!/usr/bin/env python3

from pathlib import Path
from datetime import datetime
import shutil
import sys

ROOT = Path.home() / "VideoPlatform"
FRONT = ROOT / "plugins" / "web" / "frontend"

WATCH = FRONT / "watch.html"
SHORTS = FRONT / "shorts.html"
COMMENTS = FRONT / "comments.html"

# --------------------------------------------------
# Check files
# --------------------------------------------------

for file in (WATCH, SHORTS):
    if not file.is_file():
        print("ERROR: Missing file:", file)
        sys.exit(1)

watch_text = WATCH.read_text(encoding="utf-8")
shorts_text = SHORTS.read_text(encoding="utf-8")

new_watch = watch_text
new_shorts = shorts_text

# --------------------------------------------------
# Add a button to watch.html
# --------------------------------------------------

if "function openCommentsPage()" not in new_watch:

    marker = '<h2>Comments ('

    if marker not in new_watch:
        print("ERROR: Comments heading not found in watch.html.")
        print("No files changed.")
        sys.exit(1)

    button = """
<button type="button"
style="background:#292929;color:white;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;margin-bottom:12px"
onclick="openCommentsPage()">
💬 Open full comments page
</button>

"""

    new_watch = new_watch.replace(
        marker,
        button + marker,
        1
    )

    start_marker = """/* =========================
   Start
========================= */"""

    if start_marker not in new_watch:
        print("ERROR: Could not find watch.html script start marker.")
        print("No files changed.")
        sys.exit(1)

    function_code = """
function openCommentsPage(){
    const id = videoId || new URLSearchParams(location.search).get("id");

    if(!id){
        alert("Video ID is missing.");
        return;
    }

    location.href = "/comments.html?id=" + encodeURIComponent(id);
}

"""

    new_watch = new_watch.replace(
        start_marker,
        function_code + start_marker,
        1
    )

# --------------------------------------------------
# Add a comments button to every Short
# --------------------------------------------------

if "function openComments(id)" not in new_shorts:

    render_marker = "function renderShorts(videos){"

    if render_marker not in new_shorts:
        print("ERROR: renderShorts() not found.")
        print("No files changed.")
        sys.exit(1)

    new_shorts = new_shorts.replace(
        render_marker,
        """function openComments(id){
    location.href = "/comments.html?id=" + encodeURIComponent(id);
}


function renderShorts(videos){""",
        1
    )

if 'openComments(${JSON.stringify(video.id)})' not in new_shorts:

    share_marker = 'onclick="copyVideoLink(${video.id})">'

    position = new_shorts.find(share_marker)

    if position == -1:
        print("ERROR: Could not find the Share button in shorts.html.")
        print("No files changed.")
        sys.exit(1)

    action_start = new_shorts.rfind(
        '<div class="action">',
        0,
        position
    )

    if action_start == -1:
        print("ERROR: Could not find Share action container.")
        print("No files changed.")
        sys.exit(1)

    comments_button = """<div class="action">

<button type="button"
onclick="openComments(${JSON.stringify(video.id)})">
💬
</button>

<span>Comments</span>

</div>


"""

    new_shorts = (
        new_shorts[:action_start]
        + comments_button
        + new_shorts[action_start:]
    )

# --------------------------------------------------
# Independent comments page
# --------------------------------------------------

comments_html = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>i.Tube - Comments</title>

<style>
*{box-sizing:border-box}

body{
    margin:0;
    background:#111;
    color:white;
    font-family:Arial,sans-serif
}

header{
    background:#181818;
    padding:18px;
    color:#ff3030;
    font-size:26px;
    font-weight:bold
}

main{
    max-width:850px;
    margin:25px auto;
    padding:16px
}

nav{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-bottom:20px
}

a,.button{
    display:inline-block;
    background:#292929;
    color:white;
    text-decoration:none;
    border:0;
    border-radius:8px;
    padding:10px 14px;
    cursor:pointer;
    font:inherit
}

a:hover,.button:hover{
    background:#3b3b3b
}

.panel{
    background:#1b1b1b;
    border-radius:12px;
    padding:18px
}

textarea{
    width:100%;
    min-height:95px;
    resize:vertical;
    padding:12px;
    background:#111;
    color:white;
    border:1px solid #444;
    border-radius:8px;
    font:inherit
}

form{
    display:flex;
    flex-direction:column;
    gap:10px;
    margin:15px 0
}

.primary{
    background:#d92323;
    align-self:flex-start
}

.status{
    min-height:22px;
    color:#bbb;
    font-size:14px
}

.comment{
    padding:15px 0;
    border-bottom:1px solid #333
}

.meta{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    color:#aaa;
    font-size:13px
}

.author{
    color:white;
    font-weight:bold
}

.comment-text{
    white-space:pre-wrap;
    overflow-wrap:anywhere;
    line-height:1.5
}

.edit{
    margin-top:5px;
    font-size:13px
}

@media(max-width:600px){
    main{padding:12px;margin:10px auto}
    .panel{padding:13px}
}
</style>
</head>

<body>

<header>i.Tube</header>

<main>

<nav>
<a id="backVideo" href="/">← Back to video</a>
<a href="/shorts.html">Shorts</a>
<a href="/">Home</a>
</nav>

<h1>Comments</h1>

<p id="videoLabel" style="color:#aaa">
Loading comments...
</p>

<section class="panel">

<h2>Write a comment</h2>

<form id="commentForm">

<textarea
id="commentText"
maxlength="1000"
placeholder="Write a comment..."
aria-label="Write a comment"></textarea>

<button class="button primary" type="submit">
Post comment
</button>

</form>

<div id="commentStatus" class="status" role="status"></div>

<h2>
All comments (<span id="commentCount">0</span>)
</h2>

<div id="commentsList">Loading comments...</div>

</section>
</main>

<script>
"use strict";

const params = new URLSearchParams(location.search);
const videoId = params.get("id");

let viewerId = null;

const list = document.getElementById("commentsList");
const count = document.getElementById("commentCount");
const statusBox = document.getElementById("commentStatus");
const input = document.getElementById("commentText");
const label = document.getElementById("videoLabel");
const backVideo = document.getElementById("backVideo");

if(videoId){
    backVideo.href =
        "/watch.html?id=" + encodeURIComponent(videoId);

    label.textContent = "Video ID: " + videoId;
}else{
    label.textContent = "Video ID is missing.";
    list.textContent =
        "Open this page using a video's Comments button.";

    document.getElementById("commentForm").hidden = true;
}

async function loadViewer(){
    const token = localStorage.token;

    if(!token) return;

    try{
        const response = await fetch("/accounts/me", {
            headers:{
                Authorization:"Bearer " + token
            }
        });

        const data = await response.json();

        if(data.success && data.user){
            viewerId = data.user.id;
        }
    }catch(error){
        console.warn("Could not load current user:", error);
    }
}

function makeButton(text, callback){
    const button = document.createElement("button");

    button.type = "button";
    button.className = "button edit";
    button.textContent = text;
    button.addEventListener("click", callback);

    return button;
}

async function loadComments(){
    if(!videoId) return;

    list.textContent = "Loading comments...";

    try{
        const response = await fetch(
            "/comments/" + encodeURIComponent(videoId)
        );

        const data = await response.json();

        if(!response.ok || !data.success){
            list.textContent =
                data.error || "Could not load comments.";

            return;
        }

        const comments = Array.isArray(data.comments)
            ? data.comments
            : [];

        count.textContent = String(comments.length);
        list.replaceChildren();

        if(comments.length === 0){
            list.textContent = "No comments yet.";
            return;
        }

        for(const comment of comments){

            const article = document.createElement("article");
            article.className = "comment";

            const meta = document.createElement("div");
            meta.className = "meta";

            const author = document.createElement("span");
            author.className = "author";
            author.textContent = comment.username || "Unknown user";

            const edited = document.createElement("span");
            edited.textContent = comment.updated_at ? "Edited" : "";

            meta.append(author, edited);

            const text = document.createElement("p");
            text.className = "comment-text";
            text.textContent = comment.text || "";

            article.append(meta, text);

            if(
                viewerId !== null &&
                String(viewerId) === String(comment.user_id)
            ){
                article.append(
                    makeButton("Edit / delete", async () => {
                        const value = prompt(
                            "Edit your comment. Leave it empty and press OK to delete it.",
                            comment.text || ""
                        );

                        if(value === null) return;

                        await editComment(comment.id, value);
                    })
                );
            }

            list.append(article);
        }

    }catch(error){
        console.error("Load comments error:", error);
        list.textContent = "Error loading comments.";
    }
}

async function editComment(id, text){
    const token = localStorage.token;

    if(!token){
        statusBox.textContent = "Please log in first.";
        return;
    }

    statusBox.textContent = "Saving...";

    try{
        const response = await fetch(
            "/comments/" + encodeURIComponent(id) + "/edit",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json",
                    Authorization:"Bearer " + token
                },
                body:JSON.stringify({text})
            }
        );

        const data = await response.json();

        if(!response.ok || !data.success){
            statusBox.textContent =
                data.error || "Could not update comment.";

            return;
        }

        statusBox.textContent = data.removed
            ? "Comment deleted."
            : "Comment updated.";

        await loadComments();

    }catch(error){
        console.error("Edit comment error:", error);
        statusBox.textContent = "Error updating comment.";
    }
}

document.getElementById("commentForm").addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const token = localStorage.token;
        const text = input.value.trim();

        if(!videoId){
            statusBox.textContent = "Video ID is missing.";
            return;
        }

        if(!token){
            statusBox.textContent = "Please log in to post a comment.";
            return;
        }

        if(!text){
            statusBox.textContent = "Write a comment first.";
            return;
        }

        statusBox.textContent = "Posting...";

        try{
            const response = await fetch(
                "/comments/" + encodeURIComponent(videoId),
                {
                    method:"POST",
                    headers:{
                        "Content-Type":"application/json",
                        Authorization:"Bearer " + token
                    },
                    body:JSON.stringify({text})
                }
            );

            const data = await response.json();

            if(!response.ok || !data.success){
                statusBox.textContent =
                    data.error || "Could not post comment.";

                return;
            }

            input.value = "";
            statusBox.textContent = "Comment posted.";

            await loadComments();

        }catch(error){
            console.error("Post comment error:", error);
            statusBox.textContent = "Error posting comment.";
        }
    }
);

(async function init(){
    await loadViewer();
    await loadComments();
})();
</script>

</body>
</html>
'''

# --------------------------------------------------
# Validate before changing any files
# --------------------------------------------------

if new_watch == watch_text:
    print("NOTE: watch.html already has the separate comments button.")

if new_shorts == shorts_text:
    print("NOTE: shorts.html already has the comments button.")

# --------------------------------------------------
# Backup and apply
# --------------------------------------------------

backup = ROOT / (
    ".itube-comments-page-backup-" +
    datetime.now().strftime("%Y%m%d-%H%M%S")
)

backup.mkdir(parents=True, exist_ok=False)

for file in (WATCH, SHORTS, COMMENTS):
    if file.exists():
        shutil.copy2(file, backup / file.name)

try:
    WATCH.write_text(new_watch, encoding="utf-8")
    SHORTS.write_text(new_shorts, encoding="utf-8")
    COMMENTS.write_text(comments_html, encoding="utf-8")

except Exception as error:
    print("ERROR while applying changes:", error)
    print("Attempting to restore backup...")

    for file in (WATCH, SHORTS, COMMENTS):
        old = backup / file.name

        if old.exists():
            shutil.copy2(old, file)
        elif file.exists() and file == COMMENTS:
            file.unlink()

    sys.exit(1)

print()
print("SUCCESS: Comments page installed.")
print("Backup directory:", backup)
print("Created:", COMMENTS)
print("Updated:", WATCH)
print("Updated:", SHORTS)
print("Database and existing comment records were not changed.")
print()
print("Next: restart the Node.js server and test a public video and a Short.")
