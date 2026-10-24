from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path("plugins/web/frontend")
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = Path(f".itube-normal-comments-backup-{stamp}")
backup.mkdir(parents=True, exist_ok=True)

files = {
    "index.html": root / "index.html",
    "app.js": root / "app.js",
    "channel.html": root / "channel.html",
}

originals = {name: path.read_text(encoding="utf-8") for name, path in files.items()}
updated = dict(originals)

# 1. Main homepage: insert the button before Copy Link.
name = "index.html"
s = updated[name]
marker = 'onclick="copyVideoLink(${videoId})"'
pos = s.find(marker)
if pos < 0:
    print("ERROR: Could not find the Copy Link button in index.html")
    sys.exit(1)

button = '''<button
onclick="window.location.href='/comments.html?id=${encodeURIComponent(videoId)}'">
💬 Comments
</button>


'''
start = s.rfind("<button", 0, pos)
if start < 0:
    print("ERROR: Could not locate the Copy Link button element")
    sys.exit(1)
s = s[:start] + button + s[start:]
updated[name] = s

# 2. app.js: insert a comments button inside the video card template.
name = "app.js"
s = updated[name]
start = s.find("card.innerHTML=`")
if start < 0:
    print("ERROR: Could not find card.innerHTML template in app.js")
    sys.exit(1)
end = s.find("`;", start)
if end < 0:
    print("ERROR: Could not find end of video card template in app.js")
    sys.exit(1)

segment = s[start:end]
close_button = segment.rfind("</button>")
if close_button < 0:
    print("ERROR: Could not find the existing button in app.js card")
    sys.exit(1)

button = '''
            
            <button onclick="window.location.href='/comments.html?id=${encodeURIComponent(video.id)}'">
            💬 Comments
            </button>

'''
segment = segment[:close_button + len("</button>")] + button + segment[close_button + len("</button>"):]
updated[name] = s[:start] + segment + s[end:]

# 3. Channel page: insert the button into each video card.
name = "channel.html"
s = updated[name]
start = s.find("box.innerHTML += `")
if start < 0:
    print("ERROR: Could not find channel video card template")
    sys.exit(1)
end = s.find("`;", start)
if end < 0:
    print("ERROR: Could not find end of channel video card template")
    sys.exit(1)

segment = s[start:end]
close_div = segment.rfind("</div>")
if close_div < 0:
    print("ERROR: Could not find the end of channel video card")
    sys.exit(1)

button = '''
<button onclick="window.location.href='/comments.html?id=${encodeURIComponent(video.id)}'">
💬 Comments
</button>

'''
segment = segment[:close_div] + button + segment[close_div:]
updated[name] = s[:start] + segment + s[end:]

# Back up all affected files before writing any changes.
for name, path in files.items():
    shutil.copy2(path, backup / name)

for name, path in files.items():
    path.write_text(updated[name], encoding="utf-8")

print("SUCCESS: Comments buttons added to normal video cards.")
print(f"Backup: {backup.resolve()}")
for name in files:
    print(f"Updated: {files[name]}")
print("Next: refresh the homepage and a channel page to test.")
