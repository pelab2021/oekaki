let isFullScreen = false;
window.addEventListener("load", () => {
  console.log(document.querySelectorAll("button"));
  const changeScreenButton = document.querySelectorAll("button")[1];
  changeScreenButton.addEventListener("click", () => {
    const iframeContent = document.querySelector("iframe").contentWindow.document.getElementById("wholeWrapper");
    if(!isFullScreen){
      isFullScreen = true;
      iframeContent.style.transform = "";
      iframeContent.style.transformOrigin = "";
    }else{
      isFullScreen = false;
      iframeContent.style.transform = "scale(0.65)";
      iframeContent.style.transformOrigin = "0 0";
    }
  });
});
