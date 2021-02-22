// Our input frames will come from here.
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

let points = []

function onResults(results) {
  // Hide the spinner.
  document.body.classList.add('loaded');

  // Update the frame rate.
  // fpsControl.tick();

  // Draw the overlays.
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(
      results.image, 0, 0, canvasElement.width, canvasElement.height);

  let img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4);
  img.data.set(canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height).data);

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
      // if (isRightHand){
      p = new cv.Point(landmarks[8].x*canvasElement.width, landmarks[8].y*canvasElement.height);
      points.push(p);
      // }
    }

  }

  points.forEach(p=>{
    cv.circle(img, p, 5, [255, 0, 0, 255], cv.FILLED);
  })
  cv.imshow(canvasElement, img);
  img.delete();

  canvasCtx.restore();
}

const hands = new Hands({locateFile: (file) => {
  // return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1/${file}`;
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.1.1612238212/${file}`;

}})

options = {
      maxNumHands: 2,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
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


// let points2 = []
// points[]
// let splinePoints = getCurvePoints(points2, ...);