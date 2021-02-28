import { freelizer } from 'https://cdn.jsdelivr.net/npm/freelizer@1.0.0/index.min.js'

const maxNumHands = 2;

//連続だとみなす2点間の距離の上限
const maxNorm = 170;
//線の太さ
const line_thickness = 5;


const videoElement =
  document.getElementsByClassName('input_video')[0];
const canvasElement =
  document.getElementsByClassName('output_canvas')[0];
const canvasElementForSave =
  document.getElementsByClassName('output_canvas_for_save')[0];
const controlsElement =
  document.getElementsByClassName('control-panel')[0];
const canvasCtx = canvasElement.getContext('2d');

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

function audio_data_update(data) {
// data例
//{
//   deviation: 28.924883259925537,
//   frequency: 1075.4271444623207,
//   note: "C",
//   noteFrequency: 1046.5022612023952,
//   octave: 6,
// }
  if (Object.keys(data).includes("frequency") && data["frequency"] !=21.55425219941349) {
    audio_data.on = true
    audio_data.color_index = ((data.note.charCodeAt(0) - 65) + data.octave * 8) % 9;
  } else {
    audio_data.on = false
  }
}

; (async () => {
  try {
    const { start, stop, subscribe, unsubscribe } = await freelizer()
    start()
    subscribe(audio_data_update)
  } catch (error) {
    console.error(error);
  }
})()

//0.5秒ごとにfpsを計算して値を更新する
class fpsCheck{
  constructor(callback = null){
    this.counter = 0
    this.intervalId = null;
    this.fps = -1
    //500ms
    this.update_period = 500;
    this.callback = callback
    }
  _update(){
    this.fps = this.counter / (this.update_period/1000)
    this.counter = 0
    this.callback(this)
  }
  start(){
    if (this.intervalId == null){
      //0.5sごとにupdate
      this.intervalId = setInterval(this._update.bind(this), this.update_period);
    }

  }
  stop(){
    if(!(this.intervalId== null)){
      clearInterval(this.intervalId);
    }
    this.fps = -1;
  }
  tick(){
    this.counter++;
  }
}

let fpsch= new fpsCheck((_fpsch)=>{
  document.getElementById("fps_display").innerHTML = _fpsch.fps.toString() + " fps"
})
fpsch.start();


let now_line = [[], []];
let old_imgs = [];
let old_img_sum = null;

const transparent_color = new cv.Scalar(0, 0, 0, 0);

let lines = [[], []];
let back_button_cnt = 0;
const get_new_img = ()=>{
  return new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);
}

const colors =
  [
    new cv.Scalar(255, 255, 255, 255),
    new cv.Scalar(255, 0, 0, 255),
    new cv.Scalar(255, 165, 0, 255),
    new cv.Scalar(255, 255, 0, 255),
    new cv.Scalar(0, 128, 0, 255),
    new cv.Scalar(0, 255, 255, 255),
    new cv.Scalar(0, 0, 255, 255),
    new cv.Scalar(128, 0, 128, 255),
    new cv.Scalar(0, 0, 0, 255),
  ];  // RGBA

const draw_img = (src, dst)=> {
  let channels = new cv.MatVector();
  cv.split(src, channels);

  let alpha = channels.get(3);
  let mask = new cv.Mat();

  if(src.erase_mode){
    let transparent_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);
    cv.threshold(alpha, mask, 0, 255, cv.THRESH_BINARY);
    transparent_img.copyTo(dst, mask);
    transparent_img.delete();
  } else{
    cv.threshold(alpha, mask, 0, 255, cv.THRESH_BINARY);
    src.copyTo(dst, mask);
  }

  channels.delete();
  alpha.delete();
  mask.delete();
}


const onResults = (results) =>{
  // Hide the spinner.
  document.body.classList.add('loaded');

  fpsch.tick()

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (audio_data.on) {
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let index = 0; index < results.multiHandLandmarks.length; index++) {
        const classification = results.multiHandedness[index];
        const isRightHand = classification.label === 'Right';
        const landmarks = results.multiHandLandmarks[index];
        // drawConnectors(
        //     canvasCtx, landmarks, HAND_CONNECTIONS,
        //     {color: isRightHand ? '#00FF00' : '#FF0000'});
        // drawLandmarks(canvasCtx, landmarks, {
        //   color: isRightHand ? '#00FF00' : '#FF0000',
        //   fillColor: isRightHand ? '#FF0000' : '#00FF00'
        // });
        const p = new cv.Point(landmarks[8].x * canvasElement.width, landmarks[8].y * canvasElement.height);
        const hand_i = isRightHand ? 0 : 1;

        const nl_len = now_line[hand_i].length;
        if (now_line[hand_i].length > 0) {
          const sq_norm = (now_line[hand_i][nl_len - 1].x - p.x) ** 2 + (now_line[hand_i][nl_len - 1].y - p.y) ** 2;
          if (sq_norm > maxNorm ** 2) {
            lines[hand_i].push(_.cloneDeep(now_line[hand_i]));
            now_line[hand_i].splice(0);
          }
        }
        now_line[hand_i].push(p);
      }
    }
  }


  let is_empty = true;
  const check_empty = (line) => {
    is_empty = is_empty && (line.length == 0);
  };
  lines.forEach(check_empty)
  now_line.forEach(check_empty)

  let result_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);
  let now_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);

  if (old_img_sum == null){
    old_img_sum = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);
  }

  now_img.erase_mode = document.getElementById("pen_mode").value=="eraser"

  let old_imgs_changed = false;

  if (!is_empty) {

    for (let hand_i = 0; hand_i < maxNumHands; hand_i++) {
      const drawline = (line) => {
        const line_points = draw_calc(line);
        for (let i = 0; i < line_points.length - 1; i++) {
          cv.line(now_img, line_points[i], line_points[i + 1], colors[audio_data.color_index], line_thickness, cv.LINE_8, 0);
        }
      };
      lines[hand_i].forEach(drawline);
      drawline(now_line[hand_i])
    }
  }



  draw_img(old_img_sum, result_img)
  draw_img(now_img, result_img)
  cv.imshow(canvasElement, result_img);
  result_img.delete()

  if (!audio_data.on && !is_empty) {
    for (let hand_i = 0; hand_i < maxNumHands; hand_i++) {
      lines[hand_i].splice(0)
      now_line[hand_i].splice(0);
    }
    old_imgs.push(now_img);
    old_imgs_changed = true
  } else {
    now_img.delete();
  }

  while (back_button_cnt > 0) {
    old_imgs.splice(-1, 1);
    back_button_cnt -= 1;
    old_imgs_changed = true
  }

  if(old_imgs_changed){
    console.log("channged!")
    old_img_sum.setTo(transparent_color)
    old_imgs.forEach((o_img) => {
      draw_img(o_img, old_img_sum)
    });
  }

  canvasCtx.restore();
}


const save_paint = ()=>{
  if (!(old_img_sum == null)) {
    let target = get_new_img()
    cv.flip(old_img_sum, target, 1);
    cv.imshow(canvasElementForSave, target);
  }

  if (canvasElementForSave.toBlob) {
    // HTMLCanvasElement.toBlob() が使用できる場合

    // canvasの図形をPNG形式のBlobオブジェクトに変換
    canvasElementForSave.toBlob((blob)=> {
      saveAs(blob, "oekaki.png");
    }, "image/png");
  }

  

}

const hands = new Hands({
  locateFile: (file) => {
    // return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1/${file}`;
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1.1612238212/${file}`;
  }
})

const options = {
  maxNumHands: maxNumHands,
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
    await hands.send({ image: videoElement });
  },
  width: 1280,
  height: 720
});
camera.start();

function draw_calc(line) {
  let retval = []
  if (line.length > 0) {
    let points2 = []
    line.forEach((p) => {
      points2.push(p.x)
      points2.push(p.y)
    })
    let tension = 0.5;
    let numOfSeg = 20;
    let close = false;
    let splinePoints = getCurvePoints(points2, tension, numOfSeg, close);
    for (let i = 0; i < splinePoints.length / 2; i++) {
      let p = new cv.Point(splinePoints[2 * i], splinePoints[2 * i + 1])
      retval.push(p)
    }
  }
  return retval;
}

document.getElementById("back_button").onclick = () => {
  back_button_cnt += 1;
}
document.getElementById("save_button").onclick = () => {
  save_paint()
}
