import test from "node:test";
import assert from "node:assert/strict";
import {
  isSamePlanSelection,
  pointerDragged,
  planKeyboardCommand,
} from "../src/react/planner/interactions.js";

test("Space switches the plan to the selection tool outside edit fields", () => {
  assert.equal(planKeyboardCommand({ code: "Space", key: " " }), "select");
  assert.equal(planKeyboardCommand({ code: "Space", key: " " }, true), null);
  assert.equal(planKeyboardCommand({ code: "Space", key: " ", ctrlKey: true }), null);
});

test("Ctrl+Z undoes and Ctrl+Shift+Z redoes outside edit fields", () => {
  assert.equal(planKeyboardCommand({ code: "KeyZ", key: "z", ctrlKey: true }), "undo");
  assert.equal(planKeyboardCommand({ code: "KeyZ", key: "z", ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(planKeyboardCommand({ code: "KeyZ", key: "z", ctrlKey: true }, true), null);
});

test("room movement starts only when the same room is already selected", () => {
  assert.equal(isSamePlanSelection(null, "room", "room-1"), false);
  assert.equal(isSamePlanSelection({ type: "room", id: "room-2" }, "room", "room-1"), false);
  assert.equal(isSamePlanSelection({ type: "room", id: "room-1" }, "room", "room-1"), true);
});

test("stairs select first, and only the already selected body or label can move", () => {
  assert.equal(isSamePlanSelection(null, "floorOpening", "s1", "body"), false);
  assert.equal(isSamePlanSelection({ type: "floorOpening", id: "s2" }, "floorOpening", "s1", "body"), false);
  assert.equal(isSamePlanSelection({ type: "floorOpening", id: "s1" }, "floorOpening", "s1", "body"), true);
  assert.equal(isSamePlanSelection({ type: "floorOpening", id: "s1" }, "floorOpening", "s1", "label"), false);
  assert.equal(isSamePlanSelection({ type: "floorOpening", id: "s1", part: "label" }, "floorOpening", "s1", "body"), false);
  assert.equal(isSamePlanSelection({ type: "floorOpening", id: "s1", part: "label" }, "floorOpening", "s1", "label"), true);
});

test('every plan object requires its exact prior selection before movement',()=>{
 for(const type of ['houseContour','wall','opening','gap','platform','room','roomLabel','annotation','pile','pileRow','bindingLine','dimension','floorOpening']){
  assert.equal(isSamePlanSelection(null,type,'one'),false);assert.equal(isSamePlanSelection({type,id:'other'},type,'one'),false);assert.equal(isSamePlanSelection({type:'other',id:'one'},type,'one'),false);assert.equal(isSamePlanSelection({type,id:'one'},type,'one'),true);
 }
});
test('click jitter does not count as movement at any zoom or pointer type',()=>{
 assert.equal(pointerDragged({x:100,y:100},{clientX:103,clientY:102}),false);assert.equal(pointerDragged({x:100,y:100},{clientX:104,clientY:100}),false);assert.equal(pointerDragged({x:100,y:100},{clientX:105,clientY:100}),true);assert.equal(pointerDragged(null,{clientX:0,clientY:0}),false);
});
