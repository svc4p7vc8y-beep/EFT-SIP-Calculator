const dimensionBounds = (plan = {}) => {
  const points = Array.isArray(plan.house?.points) ? plan.house.points : [];
  if (points.length >= 3) {
    const xs = points.map((point) => Number(point.x) || 0);
    const ys = points.map((point) => Number(point.y) || 0);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  return {
    width: Math.max(0, Number(plan.house?.w) || 0),
    height: Math.max(0, Number(plan.house?.h) || 0),
  };
};

export function resolveRoofAxes(plan = {}, roof = {}) {
  const { width, height } = dimensionBounds(plan);
  const ridgeAxis = roof.ridgeAxis === "y" ? "y" : "x";
  return {
    ridgeAxis,
    vertical: ridgeAxis === "y",
    ridgeBaseLength: ridgeAxis === "y" ? height : width,
    span: ridgeAxis === "y" ? width : height,
  };
}

export function roofAxisLabel(ridgeAxis) {
  return ridgeAxis === "y" ? "вдоль ширины" : "вдоль длины";
}
