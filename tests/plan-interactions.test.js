import test from "node:test";
import assert from "node:assert/strict";
import {
  isSamePlanSelection,
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
