// Native WebGL2 indexed-tile renderer. No NES CPU, PPU, mapper or ROM execution.
export const NES_COLORS = ['666666','002a88','1412a7','3b00a4','5c007e','6e0040','6c0600','561d00','333500','0b4800','005200','004f08','00404d','000000','000000','000000','adadad','155fd9','4240ff','7527fe','a01acc','b71e7b','b53120','994e00','6b6d00','388700','0c9300','008f32','007c8d','000000','000000','000000','fffeff','64b0ff','9290ff','c676ff','f36aff','fe6ecc','fe8170','ea9e22','bcbe00','88d800','5ce430','45e082','48cdde','4f4f4f','000000','000000','fffeff','c0dfff','d3d2ff','e8c8ff','fbc2ff','fec4ea','feccc5','f7d8a5','e4e594','cfef96','bdf4ab','b3f3cc','b5ebf2','b8b8b8','000000','000000'].map(s=>[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,1]);
const FONT={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],0:['01110','10001','10011','10101','11001','10001','01110'],1:['00100','01100','00100','00100','00100','00100','01110'],2:['01110','10001','00001','00010','00100','01000','11111'],3:['11110','00001','00001','01110','00001','00001','11110'],4:['00010','00110','01010','10010','11111','00010','00010'],5:['11111','10000','10000','11110','00001','00001','11110'],6:['01110','10000','10000','11110','10001','10001','01110'],7:['11111','00001','00010','00100','01000','01000','01000'],8:['01110','10001','10001','01110','10001','10001','01110'],9:['01110','10001','10001','01111','00001','00001','01110'],':':['0','1','0','0','1','0','0'],'-':['000','000','000','111','000','000','000'],'.':['0','0','0','0','0','1','1'],'/':['00001','00010','00010','00100','01000','01000','10000'],'!':['1','1','1','1','1','0','1'],'?':['01110','10001','00001','00010','00100','00000','00100'],'+':['000','010','010','111','010','010','000']};
FONT['%']=['11001','11010','00010','00100','01000','01011','10011'];
export class Renderer {
  constructor(canvas){
    // Start on the classic grid. Renewal can raise only the drawing-buffer
    // density; shader coordinates and all non-character art stay 256 x 240.
    canvas.width=256;canvas.height=240;
    this.renderScale=1;
    this.canvas=canvas;const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!gl)throw new Error('이 브라우저에서 WebGL2를 사용할 수 없습니다.');this.gl=gl;
    const vert=`#version 300 es\nprecision highp float;layout(location=0)in vec2 pos;layout(location=1)in vec2 uv;layout(location=2)in float pal;layout(location=3)in vec4 color;out vec2 vUV;flat out int vPal;out vec4 vColor;void main(){gl_Position=vec4(pos.x/128.-1.,1.-pos.y/120.,0,1);vUV=uv;vPal=int(pal);vColor=color;}`;
    const frag=`#version 300 es\nprecision highp float;in vec2 vUV;flat in int vPal;in vec4 vColor;uniform sampler2D atlas;uniform vec4 palettes[128];out vec4 outColor;void main(){if(vPal==-2){outColor=texture(atlas,vUV)*vColor;return;}if(vPal<0){outColor=vColor;return;}int i=int(floor(texture(atlas,vUV).r*3.+.5));if(i==0)discard;outColor=palettes[vPal*4+i]*vColor;}`;
    const shader=(type,s)=>{const o=gl.createShader(type);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o;};
    this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    [[0,2,0],[1,2,2],[2,1,4],[3,4,5]].forEach(([loc,size,offset])=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,36,offset*4);});
    this.paletteData=new Float32Array(128*4);this.paletteLoc=gl.getUniformLocation(this.program,'palettes');this.vertices=[];this.palettes=[];
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,canvas.width,canvas.height);
    this.images=new Map();this.fontColors=[0x30,0x10,0x28,0x16,0x21,0x2c,0x12,0x20];this.fontColors.forEach((c,i)=>this.setPalette(24+i,[0x0f,0x0f,0x10,c]));
  }
  setRenderScale(scale){
    if(scale!==1&&scale!==2)throw new RangeError('Render scale must be 1 or 2.');
    const width=256*scale,height=240*scale,g=this.gl;
    const changed=this.canvas.width!==width||this.canvas.height!==height;
    // Call between render passes. Repeating the current setting must not clear
    // the framebuffer, and resizing must not recreate any textures or shaders.
    if(changed){
      if(this.vertices.length)this.flush();
      if(this.canvas.width!==width)this.canvas.width=width;
      if(this.canvas.height!==height)this.canvas.height=height;
      g.useProgram(this.program);g.bindVertexArray(this.vao);
      g.disable(g.DEPTH_TEST);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
    }
    this.renderScale=scale;g.viewport(0,0,width,height);return scale;
  }
  async loadAtlas(url){const img=new Image();img.src=url;await img.decode();this.atlasWidth=img.width;this.atlasHeight=img.height;const g=this.gl;this.texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.texture);g.pixelStorei(g.UNPACK_ALIGNMENT,1);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,img);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);}
  setPalette(id,colors){this.palettes[id]=colors;for(let i=0;i<4;i++){const c=Array.isArray(colors[i])?colors[i]:NES_COLORS[colors[i]&63];this.paletteData.set(c,id*16+i*4);}}
  begin(bg=0x0f){this.vertices.length=0;const g=this.gl,c=Array.isArray(bg)?bg:NES_COLORS[bg&63];g.clearColor(...c);g.clear(g.COLOR_BUFFER_BIT);}
  // Both themes share integer pixels. Preserve every positive thin stroke as
  // at least one pixel; genuinely empty rectangles (for example zero HP) stay empty.
  quad(x,y,w,h,u0,v0,u1,v1,pal,color=[1,1,1,1]){if(w<=0||h<=0)return;x=Math.round(x);y=Math.round(y);w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));const a=[x,y,u0,v0,pal,...color],b=[x+w,y,u1,v0,pal,...color],c=[x+w,y+h,u1,v1,pal,...color],d=[x,y+h,u0,v1,pal,...color];this.vertices.push(...a,...b,...c,...a,...c,...d);}
  rect(x,y,w,h,color=0x30,alpha=1){const c=Array.isArray(color)?color:NES_COLORS[color&63];this.quad(x,y,w,h,0,0,0,0,-1,[c[0],c[1],c[2],alpha]);}
  useTexture(texture){if(this.activeTexture!==texture){this.flush();this.activeTexture=texture;}}
  tile(index,x,y,pal=0,flipX=false,flipY=false,scale=1,alpha=1){this.useTexture(this.texture);const cols=this.atlasWidth/8,sx=(index%cols)*8,sy=Math.floor(index/cols)*8;let u0=sx/this.atlasWidth,u1=(sx+8)/this.atlasWidth,v0=sy/this.atlasHeight,v1=(sy+8)/this.atlasHeight;if(flipX)[u0,u1]=[u1,u0];if(flipY)[v0,v1]=[v1,v0];this.quad(x,y,8*scale,8*scale,u0,v0,u1,v1,pal,[1,1,1,alpha]);}
  sprite16(base,x,y,pal=0,flip=false,alpha=1){this.tile(base,x+(flip?8:0),y,pal,flip,false,1,alpha);this.tile(base+1,x+(flip?8:0),y+8,pal,flip,false,1,alpha);this.tile(base+2,x+(flip?0:8),y,pal,flip,false,1,alpha);this.tile(base+3,x+(flip?0:8),y+8,pal,flip,false,1,alpha);}
  text(str,x,y,color=0x30,scale=1,align='left'){str=String(str).toUpperCase();const width=this.textWidth(str,scale);if(align==='center')x-=width/2;if(align==='right')x-=width;const pal=24+Math.max(0,this.fontColors.indexOf(color));for(const ch of str){let tile=0x100;if(ch>='0'&&ch<='9')tile=0x110+Number(ch);else if(ch>='A'&&ch<='Z')tile=0x121+ch.charCodeAt(0)-65;else tile={':':0x11a,'+':0x10b,'.':0x10c,'-':0x10d}[ch]||0x100;this.tile(tile,x,y,pal,false,false,scale);x+=8*scale;}}
  textWidth(str,scale=1){return String(str).length*8*scale;}
  pixelText(str,x,y,color,scale=1,align='left'){
    scale=Math.max(1,Math.round(scale));
    str=String(str).toUpperCase();const width=[...str].reduce((sum,c)=>sum+((FONT[c]?.[0].length||3)+1)*scale,0)-scale;
    if(align==='center')x-=width/2;else if(align==='right')x-=width;
    for(const ch of str){const glyph=FONT[ch];if(glyph)for(let row=0;row<glyph.length;row++)for(let col=0;col<glyph[row].length;col++)if(glyph[row][col]==='1')this.rect(x+col*scale,y+row*scale,scale,scale,color);x+=((glyph?.[0].length||3)+1)*scale;}
  }
  async loadImage(key,url){const img=new Image();img.src=url;await img.decode();const g=this.gl,old=this.images.get(key);if(old)g.deleteTexture(old.texture);const texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,img);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);const data={texture,width:img.width,height:img.height};this.images.set(key,data);return data;}
  image(key,x,y,w,h,frame=0,frames=1,alpha=1){const img=this.images.get(key);if(!img)return false;this.useTexture(img.texture);const sw=img.width/frames;this.quad(x,y,w,h,(frame%frames)*sw/img.width,0,((frame%frames)+1)*sw/img.width,1,-2,[1,1,1,alpha]);return true;}
  flush(){if(!this.vertices.length)return;const g=this.gl;g.useProgram(this.program);g.bindVertexArray(this.vao);g.bindTexture(g.TEXTURE_2D,this.activeTexture||this.texture);g.uniform4fv(this.paletteLoc,this.paletteData);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(this.vertices),g.DYNAMIC_DRAW);g.drawArrays(g.TRIANGLES,0,this.vertices.length/9);this.vertices.length=0;}
  end(){this.flush();}
}
