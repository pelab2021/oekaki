const BASE_URL = "http://54.95.100.251:3000"
const DEBUG_MODE = true 

/**
 * https://aralroca.com/blog/opencv-in-the-web
 *  Here we will check from time to time if we can access the OpenCV
 *  functions. We will return in a callback if it's been resolved
 *  well (true) or if there has been a timeout (false).
 */
// function waitForOpencv(callbackFn, waitTimeMs = 30000, stepTimeMs = 100) {
//   if (cv.Mat) {
//     callbackFn(true)
//   } else {
//     let timeSpentMs = 0
//     const interval = setInterval(() => {
//       const limitReached = timeSpentMs > waitTimeMs
//       if (cv.Mat || limitReached) {
//         clearInterval(interval)
//         return callbackFn(!limitReached)
//       } else {
//         timeSpentMs += stepTimeMs
//       }
//     }, stepTimeMs)
//   }
// }

function rnorm(){
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
function rand_call(f, probability){
  if(Math.random() <= probability){
    f()
    return true
  }
  return false

}

class FishManager{
  constructor() {
    this.fish_list = []
  }
  append(img_file_name){
    this.fish_list.push(new Fish(img_file_name))
  }
  getfish_random(){
    return this.fish_list[Math.floor(Math.random() * this.fish_list.length)] 
  }
}
fm = new FishManager()

class State{
  constructor(fish) {
    if(DEBUG_MODE){
      console.log("=> " + this.constructor.name)
    }
  }
  //fishをmoveする
  move(fish){
  }
  make_transition(fish){
  }
}

//与えられた確率に従ってtransitionする。
//ヒットしない場合はtransitionしない
function make_transition_rand(fish, transiitons){
  let rand = Math.random()
  let sum = 0
  let flag = false
  let index = -1
  transiitons.forEach((element, _index) => {
    sum += element[1]
    if(flag){
      return
    }
    if (sum > rand && !flag){
      index = _index
      flag = true
    }
  });
  if (index > -1){
    fish.state = new transiitons[index][0](fish)
  }
}

//ゆっくりふわふわ
class InitialState extends State{
  move(fish){
    const speed = 0.4
    const amp = 1
    fish.rotate(amp* Math.sin(fish.t*speed))
  }
  make_transition(fish){
    let temp = [
      [ShakingState, 0.1],
      [StalkerState, 0.1],
      [StraightState, 0.1],
      [MoodyState, 0.3]
    ]
    make_transition_rand(fish, temp)
  }
}

//きまぐれに進む
class MoodyState extends State{
  constructor(fish){
    super()
    fish.Vx = Math.random() * 0.01
    fish.Vy = Math.random() * 0.01
  }
  move(fish){
    fish.x += fish.Vx * fish.dt
    fish.y += fish.Vy * fish.dt
    fish.reflect()
  }
  make_transition(fish){
    super.make_transition(fish)
    make_transition_rand(fish, [
      [InitialState, 0.4],
    ])
  }
}

//vをだんだん0にしたあとInitialに移る
class ToInitialState extends State{
  move(fish){
    fish.Vx *= 0.99
    fish.Vy *= 0.99
    fish.x += fish.Vx * fish.dt
    fish.y += fish.Vy * fish.dt
    fish.reflect()
  }
  make_transition(fish){
    if (Math.abs(fish.Vx) < 0.01 && Math.abs(fish.Vy) < 0.01){
      fish.state = new InitialState()
    }
  }
}

//揺れながら進む
class ShakingState extends State{
  move(fish){
    fish.x += fish.Vx * fish.dt
    fish.y += fish.Vy * fish.dt
    fish.rotate(5* Math.sin(fish.t))
    fish.reflect()
  }
  make_transition(fish){
    rand_call(()=>{
      fish.state = new ToInitialState()
    }, 0.1)
  }
}

class StraightState extends State{
  move(fish){
    fish.x += fish.Vx * fish.dt
    fish.y += fish.Vy * fish.dt
    fish.reflect()
  }
  make_transition(fish){
    rand_call(()=>{
      fish.state = new ToInitialState()
    }, 0.1)
  }
}

//誰かを追う
class StalkerState extends State{
  constructor(){
    super()
    this.inited = false
    if (fm.fish_list.length > 1){
      this.inited = true
      let target = fm.getfish_random()
      while (target == this){
        target = fm.getfish_random()
      }
      this.target = target
    }
  }

  move(fish){
    if (this.inited && fish.t % 10 == 0){
      const speed = 0.01
      let vx = (this.target.x - fish.x)
      let vy = (this.target.y - fish.y)
      fish.Vx = (vx/((vx**2 + vy**2)**0.5) + rnorm())*speed
      fish.Vy = (vy/((vx**2 + vy**2)**0.5) + rnorm())*speed
    }
    fish.x += fish.Vx * fish.dt
    fish.y += fish.Vy * fish.dt
    fish.reflect()
  }
  make_transition(fish){
    if (this.inited){
      rand_call(()=>{
        fish.state = new ToInitialState()
      }, 0.1)
    }else{
      fish.state = new ToInitialState()
    }
  }
}


class Fish{
  constructor(img_file_name) {
    const elem = document.createElement("img");
    elem.id = "elem"; elem.height = "225"; elem.width = "400";
    elem.id = "fish-"+ String(Math.random());
    elem.style.position = "absolute";
    elem.style.left = "0%"; elem.style.top = "0%"; elem.style.zIndex = "-10";
    elem.className = "fish";
    elem.src =  BASE_URL + `/uploads/` + img_file_name;
    // this.mat = cv.imread(elem)
    // console.log(this.mat)

    // this.parent = document.getElementById("root")
    // console.log(this.parent);
    this.parent = document.querySelector("section");
    this.parent.style.position = "relative";
    document.querySelectorAll("button").forEach(e => {
      e.style.zIndex = "10";
    })
    document.querySelector("h2").style.zIndex = "-10";
    this.parent.appendChild(elem);
    this.elem = elem
    this.x = Math.random() * (100 - this.width)
    this.y = Math.random() * (100 - this.height)
    this.Vx = Math.random() * 0.01
    this.Vy = Math.random() * 0.01
    this.dt = 1000 / 30
    this.angle = 0
    this.t = 0
    this.state = new InitialState()
    setInterval(()=>{this.moveImg()}, this.dt);
  }
  // x, y はそれぞれ0~100の値を取る
  setXY(x,y){
    this.x = x
    this.y = y
    this.elem.style.left = String(x) + "%";
    this.elem.style.top = String(y) + "%";
  }
  //0~360
  rotate(angle){
    this.angle= angle
    this.elem.style.transform = "rotate(" + String(this.angle) + "deg)"
  }
  get width(){
    return this.elem.width / this.parent.clientWidth * 100
  }
  get height(){
    return this.elem.height/ this.parent.clientHeight * 100
  }
  reflect(){
    if (this.x + this.width > 100) this.Vx = Math.abs(this.Vx) * (-1);
    if (this.x < 0) this.Vx = Math.abs(this.Vx);
    if (this.y + this.width > 100) this.Vy = Math.abs(this.Vy) * (-1);
    if (this.y < 0) this.Vy = Math.abs(this.Vy);
  }
  moveImg(){
    // console.log(this.width, this.height)
    this.t += 1
    this.state.move(this)
    if (this.t % 10 == 0){
      this.state.make_transition(this)
    }
    this.setXY(this.x, this.y)
  }

}

function main(){
    // fm.append("92.png")
    fm.append("14.png")
    for (let i = 0; i < 4; i++){
      fm.append("92.png")
    }
}

// let opencv_loaded = false
// let transparent_color = null
// const opencv_inited_handler = (success) => {
//   if (success) {
//     transparent_color = new cv.Scalar(0, 0, 0, 0);
//     opencv_loaded = true
//     // fm.append("92.png")
//     fm.append("14.png")
//     for (let i = 0; i < 4; i++){
//       fm.append("92.png")
//     }
//     console.log("Opencv.js loaded")
//   } else {
//     console.err("Opencv.js load failed")

//   }
// }
setTimeout(main, 1000);

let imageList;

// waitForOpencv(opencv_inited_handler)
const getImageList = () =>{
  const url = BASE_URL + "/uploadedList";
  fetch(url).then(res => res.json()).then(data => {imageList = data})
}

getImageList();

function change(){
  const old = document.querySelectorAll(".fish");
  old.forEach(e => e.remove());
  fm.fish_list = [];
  for (let i = 0; i < 5; i++){
    const rand = Math.floor(Math.random() * imageList.length);
    fm.append(imageList[rand]);
  }
}

setInterval(change, 60000);
setInterval(getImageList, 300000);

// const moveImg = e => {
//   const nowLeft = Number(e.style.left.split("%")[0]);
//   e.style.left = String(nowLeft + 0.3) + "%";
// }
// setInterval(getAndSwimImage, 15000);