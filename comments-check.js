
/* =====================================================
   Current User
===================================================== */

let currentUser = null;


/* =====================================================
   Get Video ID
===================================================== */

const params =
new URLSearchParams(
    window.location.search
);


/*
 * يدعم الاثنين:
 *
 * comments.html?video=123
 *
 * أو:
 *
 * comments.html?video_id=123
 */

let videoId =
    params.get("video_id") ||
    params.get("video") ||
    null;


/*
 * تنظيف Video ID
 */

if(videoId){

    videoId =
        String(videoId).trim();

}


/* =====================================================
   Escape HTML
===================================================== */

function escapeHtml(value){

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =====================================================
   Show Video Information
===================================================== */

function updateVideoInfo(){

    const info =
        document.getElementById(
            "videoInfo"
        );


    if(!videoId){

        info.innerHTML =
            '<span class="error">Video ID missing</span>';

        return;

    }


    info.innerHTML =
        "Video ID: " +
        escapeHtml(videoId);

}


/* =====================================================
   Check User
===================================================== */

async function checkUser(){

    const token =
        localStorage.token;


    const inputBox =
        document.getElementById(
            "commentInputBox"
        );


    /*
     * المستخدم غير مسجل
     */

    if(!token){

        inputBox.style.display =
            "none";

        return;

    }


    try{

        const res =
            await fetch(
                "/accounts/me",
                {
                    method:"GET",

                    headers:{
                        "Authorization":
                            "Bearer " + token
                    }
                }
            );


        const data =
            await res.json();


        console.log(
            "Current user:",
            res.status,
            data
        );


        if(
            res.ok &&
            data.success &&
            data.user
        ){

            currentUser =
                data.user;

        }else{

            currentUser =
                null;

            inputBox.style.display =
                "none";

        }

    }catch(error){

        console.error(
            "checkUser error:",
            error
        );

        currentUser =
            null;

        inputBox.style.display =
            "none";

    }

}


/* =====================================================
   Load Comments
===================================================== */

async function loadComments(){

    const box =
        document.getElementById(
            "comments"
        );


    /*
     * لا يوجد Video ID
     */

    if(!videoId){

        box.innerHTML =
            '<div class="error">Video ID missing</div>';

        return;

    }


    box.innerHTML =
        '<div class="loading">Loading comments...</div>';


    try{

        const url =
            "/videos/comments/" +
            encodeURIComponent(
                videoId


        const res =
            await fetch(url);


        const data =
            await res.json();


        console.log(
            "Comments response:",
            res.status,
            data
        );


        if(
            !res.ok ||
            !data.success
        ){

            box.innerHTML =
                '<div class="error">' +
                escapeHtml(
                    data.error ||
                    "Failed to load comments"
                ) +
                '</div>';

            return;

        }


        const comments =
            Array.isArray(
                data.comments
            )
            ? data.comments
            : [];


        box.innerHTML =
            "";


        if(
            comments.length === 0
        ){

            box.innerHTML =
                '<div class="empty">No comments yet.</div>';

            return;

        }


        comments.forEach(
            renderComment
        );

    }catch(error){

        console.error(
            "loadComments error:",
            error
        );


        box.innerHTML =
            '<div class="error">Error loading comments</div>';

    }

}


/* =====================================================
   Render Comment
===================================================== */

function renderComment(comment){

    const box =
        document.getElementById(
            "comments"
        );


    const div =
        document.createElement(
            "div"
        );


    div.className =
        "comment";


    let deleteButton =
        "";


    /*
     * إظهار زر الحذف:
     *
     * صاحب التعليق
     * أو صاحب الفيديو.
     *
     * لكن السيرفر هو المسؤول النهائي
     * عن السماح بالحذف.
     */

    if(currentUser){

        const currentUserId =
            String(
                currentUser.id
            );


        const commentUserId =
            String(
                comment.user_id
            );


        const videoOwnerId =
            comment.video_owner_id !== undefined
            ? String(
                comment.video_owner_id
              )
            : "";


        const isCommentOwner =
            currentUserId ===
            commentUserId;


        const isVideoOwner =
            videoOwnerId &&
            currentUserId ===
            videoOwnerId;


        if(
            isCommentOwner ||
            isVideoOwner
        ){

            deleteButton = `

<button
class="delete-comment"
type="button"
data-comment-id="${escapeHtml(
    String(comment.id)
)}">

Delete

</button>

`;

        }

    }


    /*
     * التاريخ
     */

    let date =
        "";


    if(comment.created_at){

        try{

            const parsedDate =
                new Date(
                    comment.created_at
                );


            if(
                !isNaN(
                    parsedDate.getTime()
                )
            ){

                date =
                    parsedDate.toLocaleString();

            }

        }catch(error){

            console.log(
                "Date error:",
                error
            );

        }

    }


    div.innerHTML = `

<div class="comment-user">

${escapeHtml(
    comment.username ||
    "User"
)}

</div>

<div class="comment-text">

${escapeHtml(
    comment.text ||
    ""
)}

</div>

${
    date
    ?
    `
<div class="comment-date">
${escapeHtml(date)}
</div>
`
    :
    ""
}

${deleteButton}

`;


    /*
     * ربط زر الحذف بالـ event listener
     * بدل وضع ID داخل onclick.
     */

    const deleteBtn =
        div.querySelector(
            ".delete-comment"
        );


    if(deleteBtn){

        deleteBtn.addEventListener(
            "click",
            function(){

                const id =
                    this.dataset.commentId;

                deleteComment(id);

            }
        );

    }


    box.appendChild(
        div
    );

}


/* =====================================================
   Add Comment
===================================================== */

async function addComment(){

    const token =
        localStorage.token;


    /*
     * تحقق من Video ID
     */

    if(!videoId){

        alert(
            "Video ID missing"
        );

        return;

    }


    /*
     * تحقق من تسجيل الدخول
     */

    if(!token){

        alert(
            "Login required"
        );

        return;

    }


    const input =
        document.getElementById(
            "commentInput"
        );


    const sendButton =
        document.getElementById(
            "sendButton"
        );


    if(!input){

        return;

    }


    const text =
        input.value.trim();


    if(!text){

        return;

    }


    if(
        text.length > 1000
    ){

        alert(
            "Comment is too long"
        );

        return;

    }


    /*
     * منع الضغط المتكرر
     */

    sendButton.disabled =
        true;


    try{

        const res =
            await fetch(
                "/videos/comments/" +
                encodeURIComponent(
                    videoId
                ),
                {

                    method:"POST",

                    headers:{

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " + token

                    },

                    body:
                        JSON.stringify({
                            text:text
                        })

                }
            );


        const data =
            await res.json();


        console.log(
            "Add comment response:",
            res.status,
            data
        );


        if(
            !res.ok ||
            !data.success
        ){

            alert(
                data.error ||
                "Failed to add comment"
            );

            return;

        }


        input.value =
            "";


        await loadComments();

    }catch(error){

        console.error(
            "Add comment error:",
            error
        );


        alert(
            "Error adding comment"
        );

    }finally{

        sendButton.disabled =
            false;

    }

}


/* =====================================================
   Delete Comment
===================================================== */

async function deleteComment(
    commentId
){

    const token =
        localStorage.token;


    /*
     * تحقق من Video ID
     */

    if(!videoId){

        alert(
            "Video ID missing"
        );

        return;

    }


    /*
     * تحقق من Comment ID
     */

    if(!commentId){

        alert(
            "Comment ID missing"
        );

        return;

    }


    /*
     * تحقق من تسجيل الدخول
     */

    if(!token){

        alert(
            "Login required"
        );

        return;

    }


    if(
        !confirm(
            "Delete this comment?"
        )
    ){

        return;

    }


    try{

        const url =
            "/videos/comments/" +
            encodeURIComponent(commentId)
            );


        console.log(
            "DELETE URL:",
            url
        );


        const res =
            await fetch(
                url,
                {

                    method:"DELETE",

                    headers:{
                        "Authorization":
                            "Bearer " + token,

                        "Accept":
                            "application/json"
                    }

                }
            );


        /*
         * نقرأ الرد كنص أولاً،
         * حتى لو السيرفر رجع HTML بسبب خطأ.
         */

        const raw =
            await res.text();


        console.log(
            "Delete status:",
            res.status
        );


        console.log(
            "Delete raw response:",
            raw
        );


        let data;


        try{

            data =
                JSON.parse(raw);

        }catch(error){

            console.error(
                "Delete JSON parse error:",
                error
            );


            alert(
                "Server returned an invalid response. HTTP " +
                res.status
            );

            return;

        }


        console.log(
            "Delete JSON:",
            data
        );


        if(
            !res.ok ||
            !data.success
        ){

            alert(
                data.error ||
                "Failed to delete comment. HTTP " +
                res.status
            );

            return;

        }


        await loadComments();

    }catch(error){

        console.error(
            "Delete comment error:",
            error
        );


        alert(
            "Error deleting comment: " +
            error.message
        );

    }

}


/* =====================================================
   Enter Key
===================================================== */

const commentInput =
    document.getElementById(
        "commentInput"
    );


if(commentInput){

    commentInput.addEventListener(
        "keydown",
        function(event){

            if(
                event.key === "Enter"
            ){

                event.preventDefault();

                addComment();

            }

        }
    );

}


/* =====================================================
   Start
===================================================== */

async function start(){

    updateVideoInfo();

    await checkUser();

    await loadComments();

}


start();

