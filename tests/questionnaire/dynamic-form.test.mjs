import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfiguration,defaultCatalog, visibleQuestions,validateConfiguration,validateAnswers,recommendServices} from '../../packages/questionnaire/src/index.js';
const conf=defaultConfiguration(),catalog=defaultCatalog();
const answers={situation:'lost',reach:'social',bottleneck:'booking',impact:'sales',priority:'growth',constraints:'time',goals:['new_clients','sales'],solutions:['svc-web','svc-social'],clinic_access:'reminder'};
test('default questionnaire is valid and editable',()=>assert.deepEqual(validateConfiguration(conf,catalog),[]));
test('questions vary by activity without losing common steps',()=>{
 assert(visibleQuestions(conf,'clinic','challenge').some(x=>x.id==='clinic_access'));
 assert(!visibleQuestions(conf,'restaurant','challenge').some(x=>x.id==='clinic_access'));
 assert(visibleQuestions(conf,'restaurant','challenge').some(x=>x.id==='restaurant_orders'));
});
test('empty required fields are rejected',()=>{
 const errors=validateAnswers(conf,'clinic',{},catalog);assert(errors.goals);assert(errors.solutions);assert(errors.situation);
});
test('valid answers pass validation',()=>assert.deepEqual(validateAnswers(conf,'clinic',answers,catalog),{}));
test('other requires a meaningful explanation',()=>{
 const errors=validateAnswers(conf,'clinic',{...answers,situation:'other'},catalog);assert(errors.situation);
 assert(!validateAnswers(conf,'clinic',{...answers,situation:'other',situation__other:'ازدحام مدخل العيادة'},catalog).situation);
});
test('unknown answer ID is rejected',()=>assert(validateAnswers(conf,'clinic',{...answers,goals:['INVALID']},catalog).goals));
test('unavailable service cannot be selected',()=>assert(validateAnswers(conf,'clinic',{...answers,solutions:['does-not-exist']},catalog).solutions));
test('question duplicate identifiers are rejected',()=>{const bad=structuredClone(conf);bad.questions[1].id=bad.questions[0].id;assert(validateConfiguration(bad,catalog).length);});
test('service price must be numeric',()=>{const bad=structuredClone(catalog);bad[0].price='450';assert(validateConfiguration(conf,bad).some(e=>e.includes('السعر')));});
test('question numeric values validate range and reject text',()=>{
 const customized=structuredClone(conf);customized.questions.push({id:'budget',label:'ما الميزانية المتاحة الآن؟',section:'challenge',type:'number',activityIds:['*'],order:2,options:[],required:true,active:true,otherAllowed:false,min:0,max:10000});
 assert(validateAnswers(customized,'clinic',{...answers,budget:'abc'},catalog).budget);
 assert(validateAnswers(customized,'clinic',{...answers,budget:-1},catalog).budget);
 assert(!validateAnswers(customized,'clinic',{...answers,budget:300},catalog).budget);
});
test('recommendations are explainable and based on customer answers',()=>{
 const ranked=recommendServices(conf,'clinic',answers,catalog);
 assert(ranked.some(x=>x.id==='svc-social'&&x.score>0));
 assert(ranked.every(x=>x.reasons.length));
});
test('administration can add questions and activities without code change',()=>{
 const edit=structuredClone(conf);edit.activities.push({id:'hotel',label:'فندق',active:true});edit.questions.push({id:'occupancy',label:'كيف تتم الحجوزات للفندق اليوم؟',type:'single',section:'challenge',required:true,active:true,activityIds:['hotel'],order:20,options:[{id:'phone',label:'هاتف'},{id:'web',label:'الويب'}],otherAllowed:false,min:null,max:null});
 assert.deepEqual(validateConfiguration(edit,catalog),[]);
 assert(visibleQuestions(edit,'hotel','challenge').some(q=>q.id==='occupancy'));
 assert(!visibleQuestions(edit,'factory','challenge').some(q=>q.id==='occupancy'));
});
test('revised question wording keeps stable IDs and existing answers',()=>{
 const updated=structuredClone(conf);const q=updated.questions.find(x=>x.id==='situation');q.label='أي جانب من تجربة العميل تحتاجون تغييره في البداية؟';
 assert.deepEqual(validateConfiguration(updated,catalog),[]);
 assert.deepEqual(validateAnswers(updated,'clinic',answers,catalog),{});
 assert.equal(visibleQuestions(updated,'clinic','challenge').find(x=>x.id==='situation').label,q.label);
});
test('edited service price and title become the dynamic customer and rep catalog',()=>{
 const edited=structuredClone(catalog);edited[0].title='موقع تعريفي مخصص';edited[0].price=2250;
 assert.deepEqual(validateConfiguration(conf,edited),[]);
 assert.deepEqual(validateAnswers(conf,'clinic',answers,edited),{});
 assert.equal(edited.find(x=>x.id==='svc-web').price,2250);
});
test('archived services cannot be newly selected',()=>{
 const edited=structuredClone(catalog);edited.find(x=>x.id==='svc-social').active=false;
 assert(validateAnswers(conf,'clinic',answers,edited).solutions);
});
