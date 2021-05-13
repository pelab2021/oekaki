import {freelizer} from 'https://cdn.jsdelivr.net/npm/freelizer@1.0.0/index.min.js'

const MAX_NUM_HANDS = 2;
const MIC_THRESHOLD = 0.01

const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasElementForSave = document.getElementsByClassName('output_canvas_for_save')[0];
const canvasCtx = canvasElement.getContext('2d');
const loudnessElement = document.getElementById("loudness")


// 設定パラメータ
let line_thickness = 15; // 線の太さ
let line_color = [255,255,255,255]; //RGBA
let line_on = false; // ペン/消しゴム の線を描画するかどうか
let erase_mode = false; // ペンを使うか消しゴムを使うか

let back_button_cnt = 0
let forward_button_cnt = 0
let clear_flag = false

// Optimization: Turn off animated spinner after its hiding animation is done.
const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
  spinner.style.display = 'none';
};

let audio_data = {
  on: true,
  //0:白 1:赤 ... 8:黒
  color_index: 0
}


let audioCtx = null
let wavedata = null
let analyser = null

const audio_init = async () => {
  audioCtx = new (window.AudioContext
    || window.webkitAudioContext || window.mozAudioContext)();

  analyser = audioCtx.createAnalyser();
  wavedata = new Float32Array(analyser.fftSize);
  analyser.fftSize = 512;
  // analyser.connect(audioCtx.destination)
  const mic_stream = await navigator.mediaDevices.getUserMedia({audio: true});
  const mic_input = audioCtx.createMediaStreamSource(mic_stream);
  mic_input.connect(analyser);
}

window.onload = async () => {
  audio_init()
}

let on_pre = false
const audio_data_update = (data) => {
  // data例
  //{
  //   deviation: 28.924883259925537,
  //   frequency: 1075.4271444623207,
  //   note: "C",
  //   noteFrequency: 1046.5022612023952,
  //   octave: 6,
  // }

  let on = false
  if (analyser != null) {
    analyser.getFloatTimeDomainData(wavedata);
    const max = wavedata.reduce((a, b) => Math.max(a, b))
    loudnessElement.innerHTML = max
    on = max > MIC_THRESHOLD
  }
  if (on && Object.keys(data).includes("frequency") && data["frequency"] != 21.55425219941349) {
    audio_data.color_index = ((data.note.charCodeAt(0) - 65) + data.octave * 8) % 9;
  }
  audio_data.on = on | on_pre
  on_pre = on
}

  ; (async () => {
    try {
      const {start, stop, subscribe, unsubscribe} = await freelizer()
      start()
      subscribe(audio_data_update)
    } catch (error) {
      console.error(error);
    }
  })()

// // local fileを対象にworkerを起動すると出るエラーのための対処
// // https://tshino.hatenablog.com/entry/20180106/1515218776
// var newWorkerViaBlob = function(relativePath) {
//   var baseURL = window.location.href.replace(/\\/g, '/').replace(/\/[^\/]*$/, '/');
//   var array = ['importScripts("' + baseURL + relativePath + '");'];
//   var blob = new Blob(array, {type: 'text/javascript'});
//   var url = window.URL.createObjectURL(blob);
//   return new Worker(url);
// };
// var newWorker = function(relativePath) {
//   try {
//     return newWorkerViaBlob(relativePath);
//   } catch (e) {
//     return new Worker(relativePath);
//   }
// };

let render_worker = null;
let camera_img_from_mediapipe = null;


let oekaki_img = null;
if (window.Worker) {
  render_worker = new Worker("render.js")

  render_worker.onmessage = (e) => {
    render_loop_cnt = e.data.loop_cnt;
    if(e.data.draw){
      oekaki_img = e.data.img;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(camera_img_from_mediapipe, 0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.putImageData(oekaki_img, 0, 0)
      canvasCtx.restore();
    }
  }

} else {
  console.err("can't find window.Worker.");
}
//0.5秒ごとにfpsを計算して値を更新する
class fpsCheck {
  constructor(callback = null) {
    this.counter = 0
    this.intervalId = null;
    this.fps = -1
    //500ms
    this.update_period = 500;
    this.callback = callback
  }
  _update() {
    this.fps = this.counter / (this.update_period / 1000)
    this.counter = 0
    this.callback(this)
  }
  start() {
    if (this.intervalId == null) {
      //0.5sごとにupdate
      this.intervalId = setInterval(this._update.bind(this), this.update_period);
    }

  }
  stop() {
    if (!(this.intervalId == null)) {
      clearInterval(this.intervalId);
    }
    this.fps = -1;
  }
  tick() {
    this.counter++;
  }
}

let fpsch = new fpsCheck((_fpsch) => {
  document.getElementById("fps_display").innerHTML = _fpsch.fps.toString() + " fps"
})
fpsch.start();

let loop_cnt = 0;
let render_loop_cnt = 0;
let onresults_first = true
const onResults = (results) => {
  if (onresults_first) {
    // Hide the spinner.
    document.body.classList.add('loaded');
    onresults_first = false
  }

  fpsch.tick()
  camera_img_from_mediapipe = results.image
  const hands_found = results.multiHandLandmarks && results.multiHandedness
  const isRightHand = hands_found ?
    results.multiHandedness.map((classification, index, array) => {
      return classification.label === 'Right';
    })
    : null;
  loop_cnt++;
  let draw = (loop_cnt <= render_loop_cnt + 2);
  const render_data = {
    msg: "main",
    audio_data: audio_data,
    hands_found: hands_found,
    isRightHand: isRightHand,
    landmarks: hands_found ? results.multiHandLandmarks : null,
    height: canvasElement.height,
    width: canvasElement.width,
    back_button_cnt: back_button_cnt,
    forward_button_cnt: forward_button_cnt,
    clear_flag: clear_flag,
    line_on: line_on,
    erase_mode: erase_mode,
    line_thickness: line_thickness,
    line_color:line_color,
    loop_cnt: loop_cnt,
    draw:  draw//render_loop_cntが過度に遅れてる場合は描画をせずに点の記録に留める
  }
  render_worker.postMessage(render_data);
  back_button_cnt = 0
  forward_button_cnt = 0
  clear_flag = false
// document.getElementById("pen_mode").value == "eraser"
}

const hands = new Hands({
  locateFile: (file) => {
    // return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1/${file}`;
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1.1612238212/${file}`;
  }
})

const options = {
  maxNumHands: MAX_NUM_HANDS,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
}

hands.setOptions(options);
hands.onResults(onResults);

/**
 * Instantiate a camera. We'll feed each frame we receive into the solution.
 */
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();

const save_paint = () => {

  if (!(oekaki_img == null)) {
    canvasElementForSave.getContext('2d').putImageData(oekaki_img, 0, 0)
  }

  if (canvasElementForSave.toBlob) {
    canvasElementForSave.toBlob((blob) => {
      saveAs(blob, "oekaki.png");
    }, "image/png");
  }
  canvasElementForSave.getContext('2d').clearRect(0, 0, canvasElement.width, canvasElement.height);
}

document.getElementById("back_button").onclick = () => {
  back_button_cnt += 1;
}
document.getElementById("forward_button").onclick = () => {
  forward_button_cnt += 1;
}

document.getElementById("save_button").onclick = () => {
  save_paint()
}

document.getElementById("upload_button").onclick = () => {
  const sendData = canvasElement.toDataURL("image/png");
  const fullScreen = document.createElement("div");
  fullScreen.id = "uploadFullscreen";
  fullScreen.style.cssText = "position: fixed; height: 100%; width: 100%;";
  fullScreen.innerHTML = `
    <div id="uploadArea">
    <h3><ruby><rb>作</rb><rt>つく</rt></ruby>った<ruby><rb>絵</rb><rt>え</rt></ruby>をアップロードしよう！</h3>  
    <div><ruby><rb>絵</rb><rt>え</rt></ruby>をアップロードするとホームページ<ruby><rb>内</rb><rt>ない</rt></ruby>を<ruby><rb>絵</rb><rt>え</rt></ruby>が<ruby><rb>泳</rb><rt>およ</rt></ruby>ぎます。</div>
    <div>ほかの人にも<ruby><rb>自分</rb><rt>じぶん</rt></ruby>の<ruby><rb>作品</rb><rt>さくひん</rt></ruby>をじまんしよう！</div>
      <div><img src=${sendData} height="360px" width="640px" id="imgArea"></div>
      <div>
        <input type="text" placeholder="ニックネーム" id="uploadName" size="20">
        <button id="uploadPost">アップロード</button>
        <button id="uploadCancel">キャンセル</button>
      </div>
    </div>
  `;
  document.body.appendChild(fullScreen);
  document.getElementById("uploadCancel").onclick = () => {
    fullScreen.remove();
  };
  document.getElementById("uploadPost").addEventListener("click", () => {
    const nickname = document.getElementById("uploadName").value;

    const url = "http://54.95.100.251:3000/upload";
    const param = {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({data: sendData, nickname: nickname})
    };
    fetch(url, param).then((response) => {
      if(!response.ok){
        console.log('error!');
      }
      console.log(response);
      return response.text();
    }).then((data) => {
      const jsonData = JSON.parse(data);
      alert("アップロードできました！");
      console.log(`Your Image was saved as ${jsonData["filename"]}`);
      document.getElementById("uploadFullscreen").remove();
    }).catch((error) => {
      alert("アップロードに失敗しました");
      console.log(`[error] ${error}`);
    });
  });
}

document.getElementById("eraser").onclick = () => {
  if (document.getElementById("eraser").classList.contains("valid")) {
    document.getElementById("eraser").classList.remove("valid");
    document.getElementById("eraser").classList.add("invalid");
    erase_mode = false;
    line_on = false;
  }
  else {
    document.getElementById("eraser").classList.remove("invalid");
    document.getElementById("eraser").classList.add("valid");
    erase_mode = true;
    line_on = true;
  }
  document.getElementById("pen").classList.remove("valid");
  document.getElementById("pen").classList.add("invalid");
  times++;
}

document.getElementById("pen").onclick = () => {
  if (document.getElementById("pen").classList.contains("valid")) {
    document.getElementById("pen").classList.remove("valid");
    document.getElementById("pen").classList.add("invalid");
    erase_mode = false;
    line_on = false;
  }
  else {
    document.getElementById("pen").classList.add("valid");
    document.getElementById("pen").classList.remove("invalid");
    erase_mode = false;
    line_on = true;
  }

  document.getElementById("eraser").classList.remove("valid");
  document.getElementById("eraser").classList.add("invalid");
  times++;
}

// document.getElementById("eraser").onclick = () => {
//   erase_mode = true;
//   line_on = true;
//   times++;
//   document.getElementById("eraser").classList.remove("invalid");
//   document.getElementById("eraser").classList.add("valid");
//   document.getElementById("pen").classList.remove("valid");
//   document.getElementById("pen").classList.add("invalid");
// }
// document.getElementById("pen").onclick = () => {
//   erase_mode = false;
//   line_on = true;
//   times++;
//   document.getElementById("pen").classList.remove("invalid");
//   document.getElementById("pen").classList.add("valid");
//   document.getElementById("eraser").classList.remove("valid");
//   document.getElementById("eraser").classList.add("invalid");
// }

document.getElementById("clear_button").onclick = () => {
  clear_flag = true;
}

document.getElementById("fullOverlay").onclick = async () => {
  document.getElementById("fullOverlay").remove()
  document.getElementById("help_button").click();
  await audioCtx.resume()
  await audio_init()
  console.log("audio context is resumed")
  // console.log("audio_init() is called")
}
// let susresBtn = document.getElementById("susresBtn")

// susresBtn.onclick = function() {
//   if(audioCtx.state === 'running') {
//     audioCtx.suspend().then(function() {
//       susresBtn.textContent = 'Resume context';
//     });
//   } else if(audioCtx.state === 'suspended') {
//     audioCtx.resume().then(function() {
//       susresBtn.textContent = 'Suspend context';
//     });
//   }
// }


// 音声認識
var recognition = new webkitSpeechRecognition();
var elmStart = document.getElementById('recognitionStart');
var elmEnd = document.getElementById('recognitionEnd');
var elmResult = document.getElementById('recognitionResult');

recognition.lang = 'ja';
recognition.continuous = true;

let times = 0;

const colorList = {
  "red": [255,0,0,255],
  "orange": [255,165,0,255],
  "yellow": [255,255,0,255],
  "green": [0,128,0,255],
  "lightblue": [0,255,255,255],
  "blue": [0,0,255,255],
  "purple": [128,0,128,255],
  "white": [255,255,255,255],
  "black": [0,0,0,255],
  "pink": [255,20,147,255],
  "paleorange": [254,220,189,255],
  "brown": [103,67,45,255],
  "gray": [117,117,117,255]
};

recognition.addEventListener('result', function (event) {
    console.log(event.results);
    
    let text = event.results[times][0].transcript;
    if (text == '進') text = "すすむ";

    elmResult.value = text;
    
    const shineButton = (id) => {
      document.getElementById(id).style.backgroundColor = '#ffc0cb';
      setTimeout(()=>{
        document.getElementById(id).style.backgroundColor = '#ff00ff';
      }, 2000);
    }

    switch(text){
      case 'スタート':
        // erase_mode = false;
        // line_on = true;
        document.getElementById("pen").click();
        // times++;
        break;
      case '消しゴム':
        // erase_mode = true;
        // line_on = true;
        document.getElementById("eraser").click();
        // times++;
        break;
      case 'ストップ':
        document.getElementById("pen").classList.remove("valid");
        document.getElementById("pen").classList.add("invalid");
        document.getElementById("eraser").classList.remove("valid");
        document.getElementById("eraser").classList.add("invalid");
        line_on = false;
        times++;
        break;
      case '太い':
        line_thickness = 30;
        times++;
        break;
      case '細い':
        line_thickness = 5;
        times++;
        break;
      case '普通':
        line_thickness = 15;
        times++;
        break;
      case '赤':
        line_color = [255,0,0,255];
        times++;
        break;
      case 'オレンジ':
        line_color = [255,165,0,255];
        times++;
        break;
      case '黄色':
        line_color = [255,255,0,255];
        times++;
        break;
      case '緑':
        line_color = [0,128,0,255];
        times++;
        break;
      case '水色':
        line_color = [0,255,255,255];
        times++;
        break;
      case '青':
        line_color = [0,0,255,255];
        times++;
        break;
      case '紫':
        line_color = [128,0,128,255];
        times++;
        break;
      case '白':
        line_color = [255,255,255,255];
        times++;
        break;
      case '黒':
        line_color = [0,0,0,255];
        times++;
        break;
      case 'ピンク':
        line_color = [255,20,147,255];
        times++;
        break;
      case 'うすだいだい': //肌色
        line_color = [254,220,189,255];
        times++;
        break;
      case '茶色':
        line_color = [103,67,45,255];
        times++;
        break;
      case '灰色':
        line_color = [117,117,117,255];
        times++;
        break;
      case 'セーブ':
        save_paint();
        shineButton('save_button');
        times++;
        break;
      case '進む':
        forward_button_cnt += 1;
        shineButton('forward_button');
        times++;
        break;
      case '戻る':
        back_button_cnt += 1;
        shineButton('back_button');
        times++;
        break;
      case 'クリア':
        clear_flag = true;
        shineButton('clear_button');
        times++;
        break;
      default:
        times++;
        break;
    }
}, false);


window.addEventListener('DOMContentLoaded', () => {
  elmResult.value = '';
  recognition.start();
});

/*
elmStart.addEventListener('click', function () {
    elmResult.value = '';
    recognition.start();
}, false);

elmEnd.addEventListener('click', function () {
    recognition.stop();
}, false);
*/

// ヘルプ画面の表示
document.getElementById("help_button").addEventListener("click", () => {

  let helpWindow = document.createElement("div");
  helpWindow.style.cssText = "position: absolute; height: 100%; width: 100%; z-index: 10; background-color: gray; opacity: 0.8;";
  
  helpWindow.innerHTML = `
    <p style="position: absolute; top: 0; left: 70%;">↑カメラとマイクをONにしましょう！</p>
    <h2 style="position: absolute; top: 5%; left: 80%;"><a id="windowCloser" style="text-decoration: underline; cursor: pointer;">×とじる</a></h2>
    <h1 style="position: relative; top: 10%; text-align: center;">おえかきひろばへようこそ！</h1>
    <div style="position: relative; top: 10%; text-align: center;">
      <a class="helpNum">　1　</a>
      <a class="helpNum">　2　</a>
      <a class="helpNum">　3　</a>
      <a class="helpNum">　4　</a>
    </div>
    <div id="helpContent"></div>
  `;
  document.body.appendChild(helpWindow);

  let helpContents = [
    `<div class="helpContents helpContents_center">
      <p>カメラの<ruby><rb>前</rb><rt>まえ</rt></ruby>に<ruby><rb>指</rb><rt>ゆび</rt></ruby>を<ruby><rb>出</rb><rt>だ</rt></ruby>すことで、カメラが<ruby><rb>指</rb><rt>ゆび</rt></ruby>を<ruby><rb>検出</rb><rt>けんしゅつ</rt></ruby>します。</p>
      <p><ruby><rb>両手</rb><rt>りょうて</rt></ruby>を<ruby><rb>出</rb><rt>だ</rt></ruby>すと、どちらの<ruby><rb>指</rb><rt>ゆび</rt></ruby>も<ruby><rb>検出</rb><rt>けんしゅつ</rt></ruby>します。</p>
      <img src="png/select2.png" height="128px" width="128px">
      <img src="png/select.png" height="128px" width="128px">
      </div>`,
    `<div class="helpContents helpContents_left">
      <p><img src="png/penb.png"><span>をクリックして<ruby><rb>指</rb><rt>ゆび</rt></ruby>を<ruby><rb>出</rb><rt>だ</rt></ruby>すと<ruby><rb>絵</rb><rt>え</rt></ruby>が<ruby><rb>描</rb><rt>か</rt></ruby>けます。</span></p>
      <p><img src="png/eraserb.png"><span>をクリックして<ruby><rb>指</rb><rt>ゆび</rt></ruby>を<ruby><rb>出</rb><rt>だ</rt></ruby>すと<ruby><rb>描</rb><rt>か</rt></ruby>いたものを<ruby><rb>消</rb><rt>け</rt></ruby>せます。</span></p>
      <p><img src="png/color.png"><span>をクリックすると<ruby><rb>色</rb><rt>いろ</rt></ruby>を<ruby><rb>変</rb><rt>か</rt></ruby>えられます。</span></p>
      </div>`,
    `<div class="helpContents helpContents_left">
      <p><img src="png/save.png"><span>をクリックすると<ruby><rb>描</rb><rt>か</rt></ruby>いた<ruby><rb>絵</rb><rt>え</rt></ruby>を<ruby><rb>保存</rb><rt>ほぞん</rt></ruby>できます。</span></p>
      <p><img src="png/upload.png"><span>をクリックすると<ruby><rb>描</rb><rt>か</rt></ruby>いた<ruby><rb>絵</rb><rt>え</rt></ruby>をアップロードできます。</span></p>
      </div>`,
    `<div class="helpContents helpContents_center">
      <p><ruby><rb>声</rb><rt>こえ</rt></ruby>を<ruby><rb>出</rb><rt>だ</rt></ruby>すとそれに<ruby><rb>反応</rb><rt>はんのう</rt></ruby>します。まずは「スタート」と<ruby><rb>言</rb><rt>い</rt></ruby>ってみよう！</p>
    </div>`
  ];

  const helpers = document.querySelectorAll(".helpNum");
  for(let i = 0; i < helpers.length; i++){
    helpers[i].addEventListener("click", () => {
      if(document.getElementById("selectedHelp")) document.getElementById("selectedHelp").removeAttribute("id");
      document.getElementById("helpContent").innerHTML = helpContents[i];
      helpers[i].id = "selectedHelp";
    });
  }

  document.getElementById("windowCloser").addEventListener("click", () => {
    helpWindow.remove();
  });
  document.getElementsByClassName("helpNum")[0].click();

  let currentHelp = 0;
  document.addEventListener("keydown", e => {
    if(e.key === "ArrowRight" && currentHelp <= 7){
      document.getElementsByClassName("helpNum")[++currentHelp].click();
    }
    if(e.key === "ArrowLeft" && currentHelp >= 1){
      document.getElementsByClassName("helpNum")[--currentHelp].click();
    }
  });
});

let colorbuttons = document.querySelectorAll(".colors");
for (let i = 0; i < colorbuttons.length; i++) {
  colorbuttons[i].addEventListener("click", (e) => {
    const selectedColor = e.target.classList[1].split("_")[1];
    line_color = colorList[selectedColor];
    document.getElementById("current_color").className = `color_${selectedColor}`;
  })
}

