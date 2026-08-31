// Explicit door types win; old projects may only contain the outer flag.
export function isInteriorDoor(opening) {
  return opening.type === 'door' && (opening.doorType === 'interior' || (!opening.doorType && !opening.outer));
}
