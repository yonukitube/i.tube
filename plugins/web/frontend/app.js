async function checkUser(){

    const token = localStorage.token;

    const authBox =
    document.getElementById("auth");


    if(!token){

        authBox.innerHTML = `
        <button onclick="location.href='login.html'">
        Login
        </button>

        <button onclick="location.href='register.html'">
        Create Account
        </button>
        `;

        return;
    }



    try{

        const res =
        await fetch("/accounts/me",{

            headers:{
                Authorization:
                "Bearer " + token
            }

        });


        const data =
        await res.json();



        if(data.success){


            authBox.innerHTML = `

            <span>
            ${data.user.username}
            </span>


            <button onclick="location.href='upload.html'">
            Upload Video
            </button>


            <button onclick="logout()">
            Logout
            </button>

            `;


        }


    }

    catch(e){

        localStorage.removeItem("token");

    }

}




function logout(){

    localStorage.removeItem("token");

    location.reload();

}







async function loadVideos(){


    const box =
    document.getElementById("videos");



    try{


        const res =
        await fetch("/videos/list");



        const videos =
        await res.json();



        box.innerHTML="";



        videos.forEach(video=>{


            const card =
            document.createElement("div");


            card.className="video-card";



            card.innerHTML=`

            <video controls>

            <source src="/videos/watch/${video.file}">

            </video>


            <h3>
            ${video.title}
            </h3>


            <p>
            ${video.description}
            </p>


            <button onclick="likeVideo(${video.id})">

            👍 ${video.likes ? video.likes.length : 0}

            </button>
            
            <button onclick="window.location.href='/comments.html?id=${encodeURIComponent(video.id)}'">
            💬 Comments
            </button>



            `;



            box.appendChild(card);



        });



    }


    catch(e){

        console.log(e);

    }


}







async function likeVideo(id){


    const token =
    localStorage.token;



    if(!token){

        alert("Login required");

        return;

    }



    await fetch(
        "/videos/like/"+id,
        {

        method:"POST",

        headers:{

            Authorization:
            "Bearer "+token

        }

        }

    );



    loadVideos();

}






checkUser();

loadVideos();