import { quat, vec3 } from "gl-matrix";
import { Vec3 } from "../types";

enum TreeType {
  SugarMaple,
  RedMaple,
  WhitePine,
  BalsamFir,
  YellowBirch,
}

enum TreeShape {
  Columnar, // Tall and narrow, like a Lombardy Poplar
  Conical, // Wide base tapering to a point, like a Spruce
  Oval, // Rounded shape, like a Dogwood
  Irregular, // No specific shape, like an Oak
}

interface TreeData {
  type: TreeType;
  minHeight: number; // meters
  maxHeight: number; // meters
  trunkDiameterRatio: number; // ratio of height to trunk diameter
  shape: TreeShape;
}

// Define an array of trees with height ranges
const trees: TreeData[] = [
  {
    type: TreeType.SugarMaple,
    minHeight: 18,
    maxHeight: 25,
    trunkDiameterRatio: 0.04,
    shape: TreeShape.Oval,
  },
  {
    type: TreeType.RedMaple,
    minHeight: 15,
    maxHeight: 20,
    trunkDiameterRatio: 0.04,
    shape: TreeShape.Oval,
  },
  {
    type: TreeType.WhitePine,
    minHeight: 20,
    maxHeight: 30,
    trunkDiameterRatio: 0.04,
    shape: TreeShape.Conical,
  },
  {
    type: TreeType.BalsamFir,
    minHeight: 12,
    maxHeight: 15,
    trunkDiameterRatio: 0.04,
    shape: TreeShape.Conical,
  },
  {
    type: TreeType.YellowBirch,
    minHeight: 18,
    maxHeight: 22,
    trunkDiameterRatio: 0.04,
    shape: TreeShape.Oval,
  },
];

interface SpecificTree {
  type: TreeType;
  height: number; // meters
  trunkDiameter: number; // meters
  shape: TreeShape;
}

export function getRandomTree(): SpecificTree {
  // Choose a random tree
  const randomIndex = Math.floor(Math.random() * trees.length);
  const chosenTree = trees[randomIndex];

  // Choose a random height within the specified range
  const randomHeight = Math.random() * (chosenTree.maxHeight - chosenTree.minHeight) + chosenTree.minHeight;

  // Calculate the trunk diameter based on the random height and trunk diameter ratio
  const trunkDiameter = randomHeight * chosenTree.trunkDiameterRatio;

  // Return an object with specific attributes
  return {
    type: chosenTree.type,
    height: randomHeight,
    trunkDiameter,
    shape: chosenTree.shape,
  };
}

export interface Branch {
  start: vec3;
  direction: vec3;
  length: number;
  radius: number;
}

export function generateBranchStructure(tree: SpecificTree): Branch[] {
  const trunkHeight = tree.height * 0.5; // 70% of the tree height is the trunk
  const trunkDiameter = tree.trunkDiameter;
  const branchLengthRatio = 0.8; // branches get this much shorter each level
  const maxBranchDepth = 8; // maximum number of branch levels
  // const maxBranchingFactor = 5; // maximum number of branches per level
  const branchSegments: Branch[] = [];

  // Generate the trunk segment
  branchSegments.push({
    start: [0, 0, 0],
    direction: [0, 1, 0],
    length: trunkHeight,
    radius: trunkDiameter / 2,
  });

  function getRandomBranchDirection(originalDirection: vec3): vec3 {
    // Point up a bit and ensure the original direction is normalized
    const direction = vec3.normalize(vec3.create(), vec3.add(vec3.create(), originalDirection, [0, 0.25, 0] as Vec3));

    // Rotate the original direction upwards a bit

    // Generate a random rotation axis perpendicular to the original direction
    const rotationAxis = vec3.cross(vec3.create(), direction, vec3.random(vec3.create()));
    vec3.normalize(rotationAxis, rotationAxis);

    // Generate a random rotation angle
    const rotationAngle = Math.random() * Math.PI / 4;

    // Create a quaternion from the rotation axis and angle
    const rotationQuat = quat.setAxisAngle(quat.create(), rotationAxis, rotationAngle);

    // Apply the quaternion rotation to the original direction
    const perpendicularDirection = vec3.transformQuat(vec3.create(), direction, rotationQuat);

    return perpendicularDirection;
  }

  // Recursive function to generate branches
  function generateBranch(parentSegment: Branch, depth: number) {
    if (depth >= maxBranchDepth) return;

    // Calculate the starting point of the branch relative to the parent segment
    const offsetPercent = 1;
    const startOffset = parentSegment.length * offsetPercent;
    const startPoint = vec3.add(vec3.create(), parentSegment.start, vec3.scale(vec3.create(), parentSegment.direction, startOffset));

    // const branchLength = (1 - offsetPercent) * parentSegment.length * branchLengthRatio;
    // const branchRadius = (1 - offsetPercent) * parentSegment.radius * branchLengthRatio;
    // const sizeFactor = Math.min(1 - offsetPercent, branchLengthRatio);
    const sizeFactor = branchLengthRatio;
    const branchLength = parentSegment.length * sizeFactor;
    const branchRadius = parentSegment.radius * sizeFactor;

    // Randomly deviate the branch angle within the specified range
    const branchDirection = getRandomBranchDirection(parentSegment.direction);

    // Create the new branch segment
    const newSegment: Branch = {
      start: startPoint,
      direction: branchDirection,
      length: branchLength,
      radius: branchRadius,
    };
    branchSegments.push(newSegment);

    // Recursively generate child branches for the current branch
    for (let i = 0; i < 2; i++) {
      generateBranch(newSegment, depth + 1);
    }
  }

  // Generate branches for the trunk
  for (let i = 0; i < 2; i++) {
    generateBranch(branchSegments[0], 0);
  }

  return branchSegments;
}
