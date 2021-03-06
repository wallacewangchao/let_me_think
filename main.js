'use strict';
const inpMin = -1, inpMax = 1, normConst = (inpMax - inpMin)/255.0;
const IMAGE_SIZE = 224, topK = 3;

const cnv = document.getElementById("imgcnv")
const ctx = cnv.getContext("2d")
const rect_cnv = document.getElementById("rectcnv")
const rect_ctx = rect_cnv.getContext("2d")

let image_col = document.getElementById("image_col")

const out_cnv = document.getElementById("outcnv")
const out_ctx = out_cnv.getContext('2d')
const out_cnv2 = document.getElementById("outcnv2")
const out_ctx2 = out_cnv2.getContext('2d')
const out_cnv3 = document.getElementById("outcnv3")
const out_ctx3 = out_cnv3.getContext('2d')

const radio_btns = document.getElementsByName('options');
const radio_btn_labels = document.getElementsByName('prediction_labels');
// let select = document.getElementById('dropdown_labels');

var scale,  isMouseDown = false,  iter = 200,
    xMin, yMin, xMax, yMax
var model, baseModel, mobilenet, img, actMax = 36., chkMax = true,
  index = 849, weightsPred, modelReady = false;

let act_data;
let act_average;
let act_max;
let set_act_max = 36; 

rect_cnv.addEventListener('mousemove', drag, false);
rect_cnv.addEventListener('mousedown', start_drag, false);
window.addEventListener('mouseup', stop_drag, false);
window.addEventListener("paste", pasteHandler);

$(".btn").mousemove(function(element) {
  $(this).removeClass("focus");
});

// $(".btn").mouseup(function(){
//   $(this).blur();
// })

// for (let value of Object.values(IMAGENET_CLASSES)) {
//   let option = document.createElement('option');
//   // console.log(option);
//   option.text = value;
//   select.appendChild(option);
// }

function check_radio_Index(){
  for (let i=0; i < radio_btns.length; i ++){
    if (radio_btns[i].checked){
      return i;
    }
  }
}

//paste handler
function pasteHandler(e){
    if(e.clipboardData == false) return false; //empty
    var items = e.clipboardData.items;
    if(items == undefined) return false;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") == -1) continue; //not image
        var blob = items[i].getAsFile();
        var URLObj = window.URL;
        var source = URLObj.createObjectURL(blob);
        paste_createImage(source);
    }
}
//draw pasted object
function paste_createImage(source){
    img = new Image();
    img.onload = function(){
        console.log('image_col.clientHeight : '+ image_col.clientHeight );
        let canvas_height = image_col.clientHeight;
        let canvas_width = image_col.clientWidth;

        // scale = Math.min(cnv.clientWidth / img.width, cnv.clientHeight / img.height);
        scale = image_col.clientHeight / img.height;

        rect_cnv.height = cnv.height = canvas_height;
        rect_cnv.width = cnv.width = img.width*scale;

        // scale = image_col.height / img.height;
        // cnv.height = image_col.height;
        // cnv.width = image_col.width*scale;

        ctx.clearRect(0,0, cnv.width, cnv.height);
        ctx.drawImage(img, 0,0, scale*img.width, scale*img.height);

        console.log("image size "+ img.width +" "+ img.height);
        rect_ctx.clearRect(0,0, cnv.width, cnv.height);
        xMin = yMin = 0;
        xMax = (img.width - 1)*scale;  yMax = (img.height - 1)*scale;
        rect();
        rect_ctx.strokeRect(xMin,yMin, xMax-xMin,yMax-yMin);
        // fitToImage(rect_cnv, xMax, yMax);
        // fitToImage(cnv,xMax,yMax);
    }
    img.src = source;
}

function drag(ev){
  if (!isMouseDown) return
  [xMax, yMax] = getXY(ev)
  rect_ctx.clearRect(0,0, cnv.width, cnv.height);
  rect_ctx.strokeRect(xMin,yMin, xMax-xMin,yMax-yMin);
  ev.preventDefault()
}
function start_drag(ev){
  isMouseDown = true;
  [xMin, yMin] = getXY(ev)
  xMax = xMin;  yMax = yMin
  ev.preventDefault()
}
function stop_drag(ev){
  if (!isMouseDown) return;
  isMouseDown = false;
  rect();
  ev.preventDefault();
}

async function rect(){
  out_ctx.fillStyle = "white";
  out_ctx.fillRect(0,0, IMAGE_SIZE, IMAGE_SIZE);
  out_ctx.drawImage(img, xMin/scale, yMin/scale,
     (xMax - xMin)/scale, (yMax - yMin)/scale, 0,0, IMAGE_SIZE, IMAGE_SIZE);
  let ti = performance.now();
  await classify();
  console.log(Math.floor(xMin/scale) +","+ Math.floor(yMin/scale) +
    " : " + Math.floor((xMax-xMin)/scale) +"," + Math.floor((yMax-yMin)/scale) +
    " / " + Math.round(performance.now() - ti) + " ms");
}

function getXY(ev){
  var rect = cnv.getBoundingClientRect()
  return [ev.clientX - rect.left, ev.clientY - rect.top]
}

async function loadLayersModel(modelUrl) {
  let ti = performance.now();
  mobilenet = await tf.loadLayersModel(modelUrl, {
    onProgress: (fraction) => {
      document.getElementById('output').innerText = "loading progress " + fraction.toFixed(2);
    }
  });
  console.log('model loaded ' + Math.round(performance.now() - ti) + ' ms');
  document.getElementById('output').innerText = "Model is loaded!";
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  baseModel = tf.model({inputs: mobilenet.inputs, outputs: layer.output});

  const layerPred = await mobilenet.getLayer('conv_preds');
//  const weight985 = layerPred.getWeights()[0].slice([0,0,0,985],[1,1,-1,1]);
  weightsPred = layerPred.getWeights()[0];
  // makeModel(index);
}
async function makeModel(ind) {
  if(modelReady) model.dispose();
  modelReady = true;
  const weightInd = weightsPred.slice([0,0,0, parseInt(ind)],[1,1,-1,1]);
  model = tf.sequential({
    layers: [
      tf.layers.conv2d({
        inputShape: [7,7,1024],  filters: 1,  kernelSize: 1,
        useBias: false, weights: [weightInd]
      })
    ]
  });
  // await classify();
}
async function classify() {
  const batched = tf.tidy( () => {
    const image = tf.browser.fromPixels(out_cnv);
    const normalized = image.toFloat().mul(normConst).add(inpMin);
    return normalized.reshape([-1, IMAGE_SIZE, IMAGE_SIZE, 3]);
  });
  const softmax = mobilenet.predict(batched);
  const predictions = await getTopKClassesKeras(softmax, topK);
  
  let str = "I think it is a:";
  // for(let i=0; i<topK; i++)
  //   str += "\n" + predictions[i].probability.toFixed(3) + " - " + predictions[i].classInd +
  //     " - " + predictions[i].className;
  document.getElementById('output').innerText = str;
  
  //toggle buttons for classify objects
  for(let i = 0; i < radio_btns.length; i++) {
    radio_btns[i].value = predictions[i].classInd;
    radio_btn_labels[i].innerText = predictions[i].className + " - " + (predictions[i].probability * 100).toFixed(1) + "%";
  }

  // document.getElementById('user_input').innerText = predictions[0].className;
  let radio_btn_ind = check_radio_Index();
  makeModel(predictions[radio_btn_ind].classInd);

  const basePredict = baseModel.predict(batched);
  console.log(basePredict);
  const predicted = model.predict(basePredict);
  // const data = predicted.dataSync();
  act_data = predicted.dataSync();

  basePredict.dispose();
  predicted.dispose();
  let ma = act_data[0], sum = ma;
  // cacluate the max activation and average activation 
  for(let i = 1; i < 49; i++ ){
    let di = act_data[i];
    sum += di;

    // cacluate the max activation
    if(ma < di)  ma = di;
  }
  act_max = ma;
  act_average = sum/49;
  console.log("max= " + act_max.toFixed(2) + ", av= " + act_average.toFixed(2));

  // if(chkMax) act_max = actMax;

  // old visualisation with black cover
  // const imgData = out_ctx2.createImageData(7, 7);
  // let t = 0;
  // for(let i = 0; i < 7; i++ ){
  //   for(let j = 0; j < 7; j++, t++ ){
  //     imgData.data[t*4 + 3] = Math.max(255*(1 - Math.exp(0.1*(-act_data[t] + ma))), 0);
  //     console.log( Math.max((1 - Math.exp(0.1*(-act_data[t] + ma))), 0) );
  //   }
  // }
  // const imageBitmap = await createImageBitmap(imgData);
  // out_ctx2.clearRect(0,0, 224,224);
  // out_ctx2.drawImage(imageBitmap, 0,0, 224,224);

  // new visualisation with reddots
  // drawDots();
  drawSquare();
}

function drawDots(){
  // if(chkMax) act_max = set_act_max;
  let k = 0;
  out_ctx3.clearRect(0,0, 224,224);
  for(let i=0; i < 7; i++){
    for (let j=0; j < 7; j++, k++){
      out_ctx3.beginPath();
      out_ctx3.ellipse(16 + [j]*32, 16 + [i] *32, 16, 16, 0, 0, 2 * Math.PI);
      let alpha = Math.max((1 - Math.exp(0.035*(-act_data[k] + set_act_max))), 0);
      out_ctx3.fillStyle = 'rgba(255, 0, 0,' + alpha + ')';
      out_ctx3.fill();
    }
  }

  console.log("set_act_max: " + set_act_max);
}

function drawSquare() {
  let k = 0;
  out_ctx3.clearRect(0,0, 224,224);
  for(let i=0; i < 7; i++){
    for (let j=0; j < 7; j++, k++){
      out_ctx3.beginPath();
      out_ctx3.rect([j]*32, [i]*32, 32, 32);
      // let alpha = Math.max((1 - Math.exp(0.095*(act_data[k] - set_act_max))), 0);
      let alpha = Math.max((1 - Math.exp(0.035*(-act_data[k] + set_act_max))), 0);
      out_ctx3.fillStyle = 'rgba(255, 0, 0  ,' + alpha + ')';
      // out_ctx3.fillStyle = 'rgba(82, 97, 110  ,' + alpha + ')';
      out_ctx3.fill();
    }
  }
  console.log("set_act_max: " + set_act_max);

}

const init = async () => {
  await loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json');
  paste_createImage('img/Teekanne.jpg');
//  paste_createImage('fig/drawing.jpg');
}
init();