import test from 'node:test';
import assert from 'node:assert/strict';
import {enemyDrawPositions} from '../dist/sprite-layout.js';
test('ordinary actor edge fragments are culled without changing actor state',()=>{
  for(const [x,shown] of [[0,false],[7,false],[8,true],[248,true],[249,false],[256,false]]){
    const enemy={type:19,mode:'actor',x,y:120};
    assert.equal(enemyDrawPositions(enemy,{x:0,y:0}).length,Number(shown));assert.equal(enemy.x,x);
  }
});
test('special actors retain their separate boundary behavior',()=>{
  for(const type of [3,4,5,6])assert.equal(enemyDrawPositions({type,mode:'actor',x:0,y:100},{x:0,y:0}).length,1);
});
test('static tiles wrap horizontally while remaining signed vertically',()=>{
  assert.deepEqual(enemyDrawPositions({mode:'static',originX:0,originY:16},{x:0,y:20}),[{x:248,y:-4},{x:-8,y:-4}]);
  assert.deepEqual(enemyDrawPositions({mode:'static',originX:80,originY:176},{x:0,y:232}),[]);
});
