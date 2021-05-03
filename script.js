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

document.getElementById("eraser").onclick = () => {
  document.getElementById("eraser").classList.remove("invalid");
  document.getElementById("eraser").classList.add("valid");
  document.getElementById("pen").classList.remove("valid");
  document.getElementById("pen").classList.add("invalid");
}
document.getElementById("pen").onclick = () => {
  document.getElementById("pen").classList.remove("invalid");
  document.getElementById("pen").classList.add("valid");
  document.getElementById("eraser").classList.remove("valid");
  document.getElementById("eraser").classList.add("invalid");
}
document.getElementById("clear_button").onclick = () => {
  clear_flag = true;
}

document.getElementById("fullOverlay").onclick = async () => {
  document.getElementById("fullOverlay").remove()
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

recognition.addEventListener('result', function (event) {
    console.log(event.results);
    
    let text = event.results[times][0].transcript;
    if (text == '進') text = "進む";

    elmResult.value = text;
    
    const shineButton = (id) => {
      document.getElementById(id).style.backgroundColor = '#ffc0cb';
      setTimeout(()=>{
        document.getElementById(id).style.backgroundColor = '#ff00ff';
      }, 2000);
    }

    switch(text){

      case 'スタート':
        erase_mode = false;
        line_on = true;
        document.getElementById("pen").click();
        // shineButton('pen');
        times++;
        break;
      case '消しゴム':
        erase_mode = true;
        line_on = true;
        document.getElementById("eraser").click();
        // shineButton('eraser');
        times++;
        break;
      case 'ストップ':
        line_on = false; //一度 line_on = falseにすると動かなくなってしまう
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
