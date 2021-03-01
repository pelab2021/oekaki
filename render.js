self.importScripts("https://docs.opencv.org/3.4.0/opencv.js","const.js", "./cardinal-spline-js/curve_calc.min.js","https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js")
let now_line = [[], []];
let old_imgs = [];
let old_img_sum = null;


let lines = [[], []];
let canvas_height = null;
let canvas_width= null;

let transparent_color = null
let colors = null
let opencv_loaded = false

/**
 * https://aralroca.com/blog/opencv-in-the-web
 *  Here we will check from time to time if we can access the OpenCV
 *  functions. We will return in a callback if it's been resolved
 *  well (true) or if there has been a timeout (false).
 */
function waitForOpencv(callbackFn, waitTimeMs = 30000, stepTimeMs = 100) {
  if (cv.Mat) {
      callbackFn(true)
  }else{
    let timeSpentMs = 0
    const interval = setInterval(() => {
        const limitReached = timeSpentMs > waitTimeMs
        if (cv.Mat || limitReached) {
        clearInterval(interval)
        return callbackFn(!limitReached)
        } else {
        timeSpentMs += stepTimeMs
        }
    }, stepTimeMs)
  }
}


const init = (success)=>{
    if(success){

    transparent_color = new cv.Scalar(0, 0, 0, 0);
    colors =
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
    opencv_loaded = true
    console.log("Opencv.js loaded")
    }else{
    console.err("Opencv.js load failed")

    }
}
    

waitForOpencv(init)

const get_new_img = () => {
    return new cv.Mat(canvas_height, canvas_width, cv.CV_8UC4, transparent_color);
}


const draw_img = (src, dst) => {
    let channels = new cv.MatVector();
    cv.split(src, channels);

    let alpha = channels.get(3);
    let mask = new cv.Mat();

    if (src.erase_mode) {
        let transparent_img = new cv.Mat(canvasElement.height, canvasElement.width, cv.CV_8UC4, transparent_color);
        cv.threshold(alpha, mask, 0, 255, cv.THRESH_BINARY);
        transparent_img.copyTo(dst, mask);
        transparent_img.delete();
    } else {
        cv.threshold(alpha, mask, 0, 255, cv.THRESH_BINARY);
        src.copyTo(dst, mask);
    }

    channels.delete();
    alpha.delete();
    mask.delete();
}
const draw_calc = (line) =>{
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
const imageDataFromMat = (mat)=>{
  // convert the mat type to cv.CV_8U
  const img = new cv.Mat()
  const depth = mat.type() % 8
  const scale =
    depth <= cv.CV_8S ? 1.0 : depth <= cv.CV_32S ? 1.0 / 256.0 : 255.0
  const shift = depth === cv.CV_8S || depth === cv.CV_16S ? 128.0 : 0.0
  mat.convertTo(img, cv.CV_8U, scale, shift)

  // convert the img type to cv.CV_8UC4
  switch (img.type()) {
    case cv.CV_8UC1:
      cv.cvtColor(img, img, cv.COLOR_GRAY2RGBA)
      break
    case cv.CV_8UC3:
      cv.cvtColor(img, img, cv.COLOR_RGB2RGBA)
      break
    case cv.CV_8UC4:
      break
    default:
      throw new Error(
        'Bad number of channels (Source image must have 1, 3 or 4 channels)'
      )
  }
  const clampedArray = new ImageData(
    new Uint8ClampedArray(img.data),
    img.cols,
    img.rows
  )
  img.delete()
  return clampedArray
}

onmessage = (e)=>{
    switch(e.data.msg){
        case "main":
            onmessage_main(e.data)
            break;
        default:
            console.error(e)
    }
}
const onmessage_main = (results_min)=>{
    if(!opencv_loaded){
        return
    }
    canvas_height= results_min.height
    canvas_width = results_min.width
    const audio_data = results_min.audio_data
    let result_img_changed = false
    
    if (audio_data.on) {
        if (results_min.hands_found) {
            result_img_changed = true
            for (let index = 0; index < results_min.landmarks.length; index++) {
                const isRightHand = results_min.isRightHand[index]
                const landmarks = results_min.landmarks[index];

                const p = new cv.Point(landmarks[8].x * canvas_width, landmarks[8].y * canvas_height);
                const hand_i = isRightHand ? 0 : 1;

                const nl_len = now_line[hand_i].length;
                if (now_line[hand_i].length > 0) {
                const sq_norm = (now_line[hand_i][nl_len - 1].x - p.x) ** 2 + (now_line[hand_i][nl_len - 1].y - p.y) ** 2;
                if (sq_norm > MAX_NORM ** 2) {
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

    let result_img = get_new_img()
    let now_img = get_new_img()

    if (old_img_sum == null) {
        old_img_sum = get_new_img()
    }

    now_img.erase_mode = results_min.erase_mode

    let old_imgs_changed = false;

    if (!is_empty) {

        for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
        const drawline = (line) => {
            const line_points = draw_calc(line);
            for (let i = 0; i < line_points.length - 1; i++) {
            cv.line(now_img, line_points[i], line_points[i + 1], colors[audio_data.color_index], LINE_THICKNESS, cv.LINE_8, 0);
            }
        };
        lines[hand_i].forEach(drawline);
        drawline(now_line[hand_i])
        }
    }

    draw_img(old_img_sum, result_img)
    draw_img(now_img, result_img)

    let target = get_new_img()
    //左右反転
    cv.flip(result_img, target, 1);
    postMessage(imageDataFromMat(target))

    result_img.delete()
    target.delete()

    if (!audio_data.on && !is_empty) {
        for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
        lines[hand_i].splice(0)
        now_line[hand_i].splice(0);
        }
        old_imgs.push(now_img);
        old_imgs_changed = true
    } else {
        now_img.delete();
    }

    while (results_min.back_button_cnt > 0) {
        old_imgs.splice(-1, 1);
        results_min.back_button_cnt -= 1;
        old_imgs_changed = true
    }

    if (old_imgs_changed) {
        old_img_sum.setTo(transparent_color)
        old_imgs.forEach((o_img) => {
        draw_img(o_img, old_img_sum)
        });
    }
}