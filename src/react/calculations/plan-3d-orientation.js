// Plan X goes right and plan Y goes down. Three.js uses Y for height, so
// placing plan Y on positive Z keeps the overhead view aligned with the plan.
export const planPointToThree = ([x,y,z]) => [x/1000,z/1000,y/1000];
export const planDirectionToThree = ([x,y,z]) => [x,z,y];
