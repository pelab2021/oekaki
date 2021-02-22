

const maxNumHands = 2;
//連続だとみなす2点間の距離の上限
const maxNorm = 200;


const videoElement =
    document.getElementsByClassName('input_video')[0];
const canvasElement =
    document.getElementsByClassName('output_canvas')[0];
const controlsElement =
    document.getElementsByClassName('control-panel')[0];
const canvasCtx = canvasElement.getContext('2d');

// We'll add this to our control panel later, but we'll save it here so we can
// call tick() each time the graph runs.
const fpsControl = new FPS();

// Optimization: Turn off animated spinner after its hiding animation is done.
const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
  spinner.style.display = 'none';
};

let now_line = [[],[]];
let old_imgs = [];


const bg_color = new cv.Scalar(0,0,0,0);
let lines = [[], []];

function onResults(results) {
  // Hide the spinner.
  document.body.classList.add('loaded');


  // let now_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, bg_color);

  // Update the frame rate.
  // fpsControl.tick();

  // Draw the overlays.
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // now_img.data.set(canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height).data);

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
      const p = new cv.Point(landmarks[8].x*canvasElement.width, landmarks[8].y*canvasElement.height);
      const nl_i = isRightHand? 0 : 1;
      
      const nl_len = now_line[nl_i].length;
      if (now_line[nl_i].length > 0){
        const sq_norm = (now_line[nl_i][nl_len - 1].x - p.x) ** 2 + (now_line[nl_i][nl_len - 1].y - p.y) ** 2;
        if (sq_norm > maxNorm ** 2) {

          // old_imgs.push(now_img);
          // now_img.delete()
          // now_img = null;
          lines[nl_i].push(_.cloneDeep(now_line[nl_i]));
          now_line[nl_i].splice(0);
          console.log(lines)
        }
      }
      now_line[nl_i].push(p);
    }

  }

  let now_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, bg_color);

  const colors = [new cv.Scalar(0, 255, 0, 255), new cv.Scalar(255, 0, 0, 255)];  // RGBA

  for (let hand_n = 0; hand_n < maxNumHands; hand_n++){
    const drawline = (line)=>{
      const line_points = draw_calc(line);
      for (let i = 0; i < line_points.length - 1; i++) {
        cv.line(now_img, line_points[i], line_points[i + 1], colors[hand_n], 3, cv.LINE_8, 0);
      }
    };
    lines[hand_n].forEach(drawline);
    drawline(now_line[hand_n])
  }

  old_imgs.forEach((o_img)=>{
    // cv.imshow(canvasElement, o_img);
  });

  cv.imshow(canvasElement, now_img);
  now_img.delete();

  canvasCtx.restore();
}

const hands = new Hands({locateFile: (file) => {
  // return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1/${file}`;
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1.1612238212/${file}`;
}})

options = {
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
    await hands.send({image: videoElement});
  },
  width: 1280,
  height: 720
});
camera.start();

// Present a control panel through which the user can manipulate the solution
// options.
// new ControlPanel(controlsElement, {
//       selfieMode: true,
//       maxNumHands: 2,
//       minDetectionConfidence: 0.5,
//       minTrackingConfidence: 0.5
//     })
//     .add([
//       new StaticText({title: 'MediaPipe Hands'}),
//       fpsControl,
//       new Toggle({title: 'Selfie Mode', field: 'selfieMode'}),
//       new Slider(
//           {title: 'Max Number of Hands', field: 'maxNumHands', range: [1, 4], step: 1}),
//       new Slider({
//         title: 'Min Detection Confidence',
//         field: 'minDetectionConfidence',
//         range: [0, 1],
//         step: 0.01
//       }),
//       new Slider({
//         title: 'Min Tracking Confidence',
//         field: 'minTrackingConfidence',
//         range: [0, 1],
//         step: 0.01
//       }),
//     ])
//     .on(options => {
//       videoElement.classList.toggle('selfie', options.selfieMode);
//       hands.setOptions(options);
//     });

function draw_calc(now_line){
  let retval = []
  if (now_line.length > 0){
    let points2 = []
    now_line.forEach((p) => {
      points2.push(p.x)
      points2.push(p.y)
    })
    let tension = 0.5;
    let numOfSeg = 20;
    let close = false;
    let splinePoints = getCurvePoints(points2, tension, numOfSeg, close);
    for (let i = 0; i < splinePoints.length / 2; i++) {
      p = new cv.Point(splinePoints[2 * i], splinePoints[2 * i + 1])
      retval.push(p)
    }
  }
  return retval;
}
