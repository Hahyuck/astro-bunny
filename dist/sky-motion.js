// Presentation-only sky. The original star field uses 1 and 2 px/tick layers;
// a slower distant layer and occasional tailed meteors fit the renewed scenery.
// All timing comes from the game frame: pause/restart need no separate clock.
const wrap = (n, size) => ((n % size) + size) % size;
const sourceX = [32,76,240,50,100,8,180,64];
const sourceY = [0,32,64,96,128,160,192,224];
export const SKY_LAYERS = Object.freeze([
  Object.freeze({count:12,speed:.125}),
  Object.freeze({count:8,speed:1}),
  Object.freeze({count:8,speed:2}),
]);
// Conservative open-sky silhouettes of the four existing paintings. Stars
// disappear behind the architecture, planets and horizon, rather than on them.
const skies = [
  [[0,0],[179,0],[181,35],[216,62],[255,67],[255,81],[233,96],[226,132],[208,154],[189,171],[80,171],[65,145],[42,132],[35,87],[15,78]],
  [[47,0],[155,0],[171,48],[221,73],[230,111],[210,149],[195,174],[81,174],[62,143],[41,126],[36,92],[19,77],[22,35]],
  [[79,0],[165,0],[166,32],[207,57],[209,94],[192,133],[192,155],[158,181],[87,181],[65,143],[65,108],[54,79]],
  [[58,0],[154,0],[154,43],[186,64],[196,97],[198,143],[177,172],[81,172],[61,146],[58,111],[47,94],[53,66]],
];
export function inSky(x,y,stage=0,mask=true) {
  if(x<0||x>=256||y<0||y>=176)return false;
  if(!mask)return true;
  const polygon=skies[wrap(stage,4)];let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[i],[bx,by]=polygon[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
export function sampleSky(frame,stage=0) {
  frame=Math.max(0,Math.floor(frame));stage=wrap(stage,4);
  const stars=[];
  for(let layer=0;layer<SKY_LAYERS.length;layer++){
    const {count,speed}=SKY_LAYERS[layer];
    for(let i=0;i<count;i++){
      const x=layer===0?wrap(19+i*73+stage*31,256):wrap((sourceX[i]^(layer===2?234:0))+stage*29,256);
      const y=Math.floor(wrap((layer===0?i*47+13:sourceY[i])+frame*speed,256));
      stars.push({x,y,layer,phase:Math.floor((frame+i*11)/8)%8});
    }
  }
  const meteors=[];
  for(const [index,period,delay,duration,speed,length] of [[0,210,36,66,2.7,19],[1,337,169,55,2.3,12]]){
    const elapsed=frame-delay;if(elapsed<0)continue;
    const age=elapsed%period,cycle=Math.floor(elapsed/period);if(age>=duration)continue;
    const startX=index===0?82+wrap(cycle*37+stage*23,93):109+wrap(cycle*53+stage*19,75);
    // The source footage descends vertically, including its short-tailed stars.
    const vx=0;
    meteors.push({x:Math.round(startX+age*vx),y:Math.round(-14+age*speed),vx,vy:speed,age,length,index});
  }
  return {stars,meteors};
}
export function drawSky(skin,colors,frame,stage=0,mask=true) {
  const {stars,meteors}=sampleSky(frame,stage);
  const dot=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(inSky(x,y,stage,mask))skin.rect(x,y,1,1,color);};
  for(const star of stars){
    const {x,y,layer,phase}=star;
    // Limited-palette twinkle, never alpha blending or subpixel motion.
    const color=layer===0?(phase===0?colors.lilac:colors.steel):layer===1?(phase<2?colors.ice:colors.lilac):(phase<2?colors.blush:colors.lilac);
    dot(x,y,color);
    if(layer===1&&phase<2){dot(x,y-1,colors.steel);dot(x,y+1,colors.steel);}
    if(layer===2){
      dot(x,y-1,color);dot(x,y+1,color);
      if(phase<4){dot(x-1,y,colors.lilac);dot(x+1,y,colors.lilac);}
      if(phase===0||phase===1){dot(x,y-2,colors.steel);dot(x,y+2,colors.steel);}
    }
  }
  for(const meteor of meteors){
    const {x,y,vx,vy,length,age}=meteor;
    for(let t=length;t>0;t--){
      if(t>age*vy)continue;
      dot(x-t*vx/vy,y-t,t>length*.66?colors.violet:t>length*.3?colors.steel:colors.lilac);
    }
    dot(x,y,colors.ice);dot(x,y-1,colors.lilac);
    if(meteor.index===0){dot(x-1,y,colors.lilac);dot(x+1,y,colors.lilac);dot(x,y+1,colors.ice);}
  }
}
