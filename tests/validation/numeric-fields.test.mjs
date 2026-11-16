import test from 'node:test';import assert from 'node:assert/strict';
import {fieldProblem} from '../../packages/app-runtime/src/form-validation.js';
const field=(name,value,type='text',extra={})=>({name,value,type,disabled:false,...extra});
test('numeric field rejects alphabetic input',()=>assert(fieldProblem(field('price','two hundred'))));
test('numeric field accepts decimal values',()=>assert.equal(fieldProblem(field('amount','250.50')),''));
test('numeric field rejects out-of-range',()=>assert(fieldProblem(field('budget','-1','number',{min:'0',max:''}))));
test('phone field rejects letters and accepts Syrian number',()=>{assert(fieldProblem(field('phone','customer123','tel')));assert.equal(fieldProblem(field('phone','+963 9 555 555 55','tel')),'');});
test('email field requires valid address',()=>{assert(fieldProblem(field('email','abc','email')));assert.equal(fieldProblem(field('email','a@example.com','email')),'');});
