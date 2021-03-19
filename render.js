self.importScripts("https://docs.opencv.org/3.4.0/opencv.js", "./cardinal-spline-js/curve_calc.min.js", "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js")
let now_line = [[], []];
let old_imgs = [];
let next_imgs = [];
let old_img_sum = null;
let now_img = null
let img_his = null;


const MAX_NUM_HANDS = 2;
//連続だとみなす2点間の距離の上限
const MAX_NORM = 200;

//まだ書いてないlineを格納する配列
let lines = [[], []];
let canvas_height = null;
let canvas_width = null;

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
  } else {
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

const get_new_img = () => {
  return new cv.Mat(canvas_height, canvas_width, cv.CV_8UC4, transparent_color);
}

class ImageHistory {
  constructor() {
    this.imgs = [];
    this.now_index = 0;
    this._sum_img = get_new_img();
  }
  push(img) {
    this.imgs.splice(this.now_index)
    this.imgs.push(img);
    this.now_index += 1;
    this.update_img_sum()
    console.log("pushed, now_index:", this.now_index)
  }
  move(num) {
    if (num != 0) {
      this.now_index += num
      this.now_index = Math.min(this.imgs.length, this.now_index)
      this.now_index = Math.max(0, this.now_index)
      this.update_img_sum()
    }
  }
  back(num) {
    this.move(-num)
  }
  forward(num) {
    this.move(num)
  }
  update_img_sum() {
    this._sum_img.setTo(transparent_color)
    this.imgs.slice(0, this.now_index).forEach((o_img) => {
      draw_img(o_img, this.sum_img)
    });
  }
  push_clear() {
    if (this.imgs.length > 0 && !this.imgs[this.now_index - 1].is_clear) {
      let erase_img = new cv.Mat(canvas_height, canvas_width, cv.CV_8UC4, new cv.Scalar(255, 255, 255, 255));
      erase_img.erase_mode = true
      erase_img.is_clear = true
      this.push(erase_img)
    }
  }
  get sum_img() {
    return this._sum_img
  }
}

const init = (success) => {
  if (success) {

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
  } else {
    console.err("Opencv.js load failed")

  }
}


waitForOpencv(init)





const draw_img = (src, dst) => {
  let channels = new cv.MatVector();
  cv.split(src, channels);

  let alpha = channels.get(3);
  let mask = new cv.Mat();

  if (src.erase_mode) {
    let transparent_img = get_new_img()
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
const draw_calc = (line) => {
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
const imageDataFromMat = (mat) => {
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

//
const draw_line = (img, line, color, thickness) => {
  const line_points = draw_calc(line);
  for (let i = 0; i < line_points.length - 1; i++) {
    cv.line(img, line_points[i], line_points[i + 1], color /*colors[audio_data.color_index]*/, thickness, cv.LINE_8, 0);
  }
};

onmessage = (e) => {
  switch (e.data.msg) {
    case "main":
      onmessage_main(e.data)
      break;
    default:
      console.error(e)
  }
}

let onmessage_main_cnt = 0;
let pre_erase_mode = false;

const onmessage_main = (render_data) => {
  if (!opencv_loaded) {
    return
  }

  canvas_height = render_data.height
  canvas_width = render_data.width
  if (img_his == null) {
    img_his = new ImageHistory()
  }
  hand_points = []

  if (render_data.hands_found) {
    for (let index = 0; index < render_data.landmarks.length; index++) {
      const isRightHand = render_data.isRightHand[index]
      const landmarks = render_data.landmarks[index];

      const p = new cv.Point(landmarks[8].x * canvas_width, landmarks[8].y * canvas_height);
      const hand_i = isRightHand ? 0 : 1;

      const nl_len = now_line[hand_i].length;
      hand_points.push(p)
      if (render_data.line_on) {
        //2点以上ある場合は距離判定
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

  //xor
  let erase_mode_toggled = (pre_erase_mode && !render_data.erase_mode) || (!pre_erase_mode && render_data.erase_mode)

  //線が書かれている途中で、 (ペン/消しゴムが置かれた/切り替えられた || 各種描画操作コマンドが実行された||色が変更された) -> ストロークの最後
  let is_stroke_end = !is_empty && (!render_data.line_on || erase_mode_toggled || (render_data.back_button_cnt > 0) || (render_data.forward_button_cnt > 0) || (render_data.clear_flag));

  console.log(img_his.now_index)
  //draw命令が来ている || ストロークの最後
  if (render_data.draw || is_stroke_end) {

    if (now_img == null) {
      now_img = get_new_img()
    }

    let result_img = get_new_img()
    let add_img = get_new_img()

    //ストロークを切り替えたタイミングから1サイクル遅れる必要がある
    now_img.erase_mode = pre_erase_mode
    add_img.erase_mode = pre_erase_mode

    draw_img(img_his.sum_img, result_img)

    let lc = render_data.line_color;
    let color = new cv.Scalar(lc[0], lc[1], lc[2], lc[3]);

    //ストロークの最後なのでにnow_lineをlinesに移す
    if (is_stroke_end) {
      for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
        lines[hand_i].push(_.cloneDeep(now_line[hand_i]));
        now_line[hand_i].splice(0);
      }
    }

    for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
      lines[hand_i].forEach(line => {
        if (line.length > 0) {
          draw_line(now_img, line, color, render_data.line_thickness);
        }
      })
      lines[hand_i].splice(0)
    }
    draw_img(now_img, result_img)
    for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
      if (now_line[hand_i].length > 0) {
        draw_line(result_img, now_line[hand_i], color, render_data.line_thickness)
      }
    }
    draw_img(add_img, result_img)

    hand_points.forEach((p) => {
      cv.circle(result_img, p, 5, new cv.Scalar(255, 0, 0, 255), 5);
    })

    let send_img = get_new_img()
    //左右反転
    cv.flip(result_img, send_img, 1);

    postMessage({
      img: imageDataFromMat(send_img),
      loop_cnt: render_data.loop_cnt,
      draw: render_data.draw
    })

    result_img.delete()
    add_img.delete()
    send_img.delete()
    if (is_stroke_end) {
      for (let hand_i = 0; hand_i < MAX_NUM_HANDS; hand_i++) {
        // lines[hand_i].splice(0)
        now_line[hand_i].splice(0);
      }
      img_his.push(now_img)
      now_img = get_new_img()
      // old_imgs_changed = true
      is_inserted = true
    }
  } else {
    postMessage({
      img: null,
      loop_cnt: render_data.loop_cnt,
      draw: render_data.draw
    })
  }


  img_his.back(render_data.back_button_cnt)
  img_his.forward(render_data.forward_button_cnt)
  if (render_data.clear_flag) img_his.push_clear()

  pre_erase_mode = render_data.erase_mode;
}
