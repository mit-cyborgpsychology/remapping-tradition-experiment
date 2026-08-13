import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./styles.css";

const canvas = document.querySelector("#scene");
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const closeSettingsButton = document.querySelector("#close-settings");
const displayModeInput = document.querySelector("#display-mode");
const diagramOverlayInput = document.querySelector("#diagram-overlay-opacity");
const diagramOverlayValue = document.querySelector("#diagram-overlay-opacity-value");
const diagramOverlayControl = document.querySelector(".diagram-overlay-control");
const countryColorsInput = document.querySelector("#country-colors");
const autoRotateInput = document.querySelector("#auto-rotate");
const poseRotationInput = document.querySelector("#pose-rotation");
const rotationSpeedInput = document.querySelector("#rotation-speed");
const rotationSpeedValue = document.querySelector("#rotation-speed-value");
const poseLabelsInput = document.querySelector("#show-pose-labels");
const poseLabelSizeInput = document.querySelector("#pose-label-size");
const poseLabelSizeValue = document.querySelector("#pose-label-size-value");
const playOpeningButton = document.querySelector("#play-opening");
const imageScaleInput = document.querySelector("#image-scale");
const imageScaleValue = document.querySelector("#image-scale-value");
const spaceScaleInput = document.querySelector("#space-scale");
const spaceScaleValue = document.querySelector("#space-scale-value");
const showLinesInput = document.querySelector("#show-lines");
const lineStyleInput = document.querySelector("#line-style");
const lineOpacityInput = document.querySelector("#line-opacity");
const lineOpacityValue = document.querySelector("#line-opacity-value");
const dimensionList = document.querySelector("#dimension-list");
const countryList = document.querySelector("#country-list");
const toggleCountriesButton = document.querySelector("#toggle-countries");
const loading = document.querySelector("#loading");
const loadingLabel = document.querySelector("#loading-label");
const tooltip = document.querySelector("#tooltip");
const randomPoseButton = document.querySelector("#random-pose");
const explorePanel = document.querySelector("#explore-panel");
const closeExploreButton = document.querySelector("#close-explore");
const selectedPoseName = document.querySelector("#selected-pose-name");
const exploreStatus = document.querySelector("#explore-status");
const exploreDisplayModeInput = document.querySelector("#explore-display-mode");
const exploreDiagramOverlayInput = document.querySelector("#explore-diagram-overlay-opacity");
const exploreDiagramOverlayValue = document.querySelector(
  "#explore-diagram-overlay-opacity-value",
);
const exploreDiagramOverlayControl = document.querySelector(".explore-overlay-control");
const comparisonButtons = [...document.querySelectorAll("[data-comparison]")];

const baseUrl = import.meta.env.BASE_URL;
const modeLabels = {
  overlay: "body + diagram",
  diagram: "diagram",
  body: "body",
  bodyTransparent: "transparent body",
};

const state = {
  mode: "bodyTransparent",
  diagramOverlayOpacity: Number(diagramOverlayInput.value) / 100,
  poseScale: Number(imageScaleInput.value),
  spaceScale: Number(spaceScaleInput.value),
  countryColors: countryColorsInput.checked,
  poseRotation: poseRotationInput.checked,
  poseRotationSpeed: Number(rotationSpeedInput.value),
  poseLabels: poseLabelsInput.checked,
  poseLabelScale: Number(poseLabelSizeInput.value),
  linesVisible: showLinesInput.checked,
  lineStyle: lineStyleInput.value,
  lineOpacity: Number(lineOpacityInput.value),
  visibleCountries: new Set(),
  visibleDimensions: new Set(),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 0.4, 22);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.7;
controls.minDistance = 3;
controls.maxDistance = 58;
controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
controls.autoRotateSpeed = 0.42;
autoRotateInput.checked = controls.autoRotate;

const poseRoot = new THREE.Group();
const anchorRoot = new THREE.Group();
const lineRoot = new THREE.Group();
const comparisonLineRoot = new THREE.Group();
scene.add(lineRoot, comparisonLineRoot, poseRoot, anchorRoot);

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");
const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(2, 2);

const poseObjects = [];
const posePlaneGeometry = new THREE.PlaneGeometry(1, 1);
const anchorObjects = new Map();
const lineMeshes = new Map();
const countryInputs = new Map();
const dimensionInputs = new Map();
let payload;
let textureGeneration = 0;
let activeTextures = [];
let lastPoseRotationTime = null;
let lastFrameTime = performance.now();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const opening = {
  active: false,
  startTime: 0,
  duration: reducedMotion ? 1800 : 9000,
  savedAutoRotate: false,
  cameraOrbitStartAngle: 0,
  cameraOrbitSpeed: (Math.PI * 2 * controls.autoRotateSpeed) / 60,
  revealWeights: null,
  lastConnectionUpdate: 0,
  cameraStart: new THREE.Vector3(0, 0.08, 5.4),
  cameraEnd: new THREE.Vector3(0, 0.4, 22),
};

const exploration = {
  active: false,
  restoring: false,
  selectedGroup: null,
  relatedGroups: new Set(),
  comparisonMode: null,
  savedCameraPosition: new THREE.Vector3(),
  savedCameraTarget: new THREE.Vector3(),
  savedAutoRotate: false,
  cameraTween: null,
  comparisonLines: [],
  lineAnimationStart: 0,
  pointerDown: null,
};

const cylinderAxis = new THREE.Vector3(0, 1, 0);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const curveSegments = 12;
const midpoint = new THREE.Vector3();
const direction = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const transform = new THREE.Matrix4();
const curveControl = new THREE.Vector3();
const curvePointA = new THREE.Vector3();
const curvePointB = new THREE.Vector3();
const curveRadial = new THREE.Vector3();
const curveNormal = new THREE.Vector3();

function setLoading(message, progress = null) {
  loading.classList.remove("is-hidden");
  loadingLabel.textContent = progress === null ? message : `${message} ${progress}%`;
}

function hideLoading() {
  loading.classList.add("is-hidden");
}

function resolveAssetUrl(path) {
  return `${baseUrl}${path.replace(/^\//, "")}`;
}

function createLabelTexture(label, color) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 1024;
  labelCanvas.height = 220;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.font = '600 70px "Helvetica Neue", Helvetica, Arial, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 28;
  context.globalAlpha = 0.72;
  context.fillText(label, 512, 112);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  context.fillText(label, 512, 112);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function createPoseLabelTexture(label) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.font = '400 58px "Helvetica Neue", Helvetica, Arial, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.95)";
  context.shadowBlur = 14;
  context.fillText(label, 256, 48);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function createPoseObject(pose) {
  const poseIndex = poseObjects.length;
  const group = new THREE.Group();
  group.userData.pose = pose;
  group.userData.basePosition = new THREE.Vector3(...pose.position);
  group.userData.revealOrder = 0;
  group.userData.visualOpacity = 1;
  group.userData.targetOpacity = 1;
  group.userData.visualScale = 1;
  group.userData.targetScale = 1;
  group.userData.rotationStart =
    (((poseIndex * 0.61803398875) % 1) - 0.5) * 1.4;
  group.userData.rotationDirection = 1;

  const imageMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    alphaTest: 0.015,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const billboard = new THREE.Group();
  const image = new THREE.Mesh(posePlaneGeometry, imageMaterial);
  image.renderOrder = 1;
  image.userData.pose = pose;
  image.userData.poseGroup = group;
  const diagramOverlay = new THREE.Mesh(
    posePlaneGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      alphaTest: 0.005,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  diagramOverlay.position.z = 0.002;
  diagramOverlay.renderOrder = 2;
  image.add(diagramOverlay);
  billboard.add(image);

  const poseLabelText = `${pose.countryLabel} · ${pose.number}`;
  const poseLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createPoseLabelTexture(poseLabelText),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  poseLabel.renderOrder = 4;
  poseLabel.visible = state.poseLabels;

  group.add(billboard, poseLabel);
  group.userData.billboard = billboard;
  group.userData.image = image;
  group.userData.diagramOverlay = diagramOverlay;
  group.userData.label = poseLabel;
  group.userData.labelText = poseLabelText;
  poseRoot.add(group);
  poseObjects.push(group);
  updatePoseScale(group);
  updatePoseAppearance(group);
  return group;
}

function updatePoseScale(group) {
  const pose = group.userData.pose;
  const aspect = pose.aspect[state.mode] || 1;
  const height = 0.72 * state.poseScale;
  const width = height * aspect;
  group.userData.image.scale.set(width, height, 1);
  const labelWidth = THREE.MathUtils.clamp(
    0.28 + group.userData.labelText.length * 0.045,
    0.78,
    1.56,
  ) * state.poseScale * state.poseLabelScale;
  const labelHeight = 0.19 * state.poseScale * state.poseLabelScale;
  group.userData.label.scale.set(labelWidth, labelHeight, 1);
  group.userData.label.position.set(
    0,
    -height * 0.5 - labelHeight * 0.58 - 0.012 * state.poseScale,
    0,
  );
}

function updatePoseAppearance(group) {
  const pose = group.userData.pose;
  const material = group.userData.image.material;
  const brightness = {
    body: 1.35,
    bodyTransparent: 1.55,
    overlay: 1.75,
    diagram: 2.8,
  }[state.mode];
  const color = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country])
    : new THREE.Color(1, 1, 1);
  if (state.countryColors) {
    color.offsetHSL(
      0,
      state.mode === "body" || state.mode === "bodyTransparent" ? 0.08 : 0.24,
      state.mode === "diagram" ? 0.03 : 0,
    );
  }
  material.color.copy(color.multiplyScalar(brightness));
  material.blending = state.mode === "diagram" ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.opacity = material.map ? group.userData.visualOpacity : 0;
  material.needsUpdate = true;

  const diagramMaterial = group.userData.diagramOverlay.material;
  const diagramColor = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country]).offsetHSL(0, 0.24, 0.03)
    : new THREE.Color(1, 1, 1);
  diagramMaterial.color.copy(diagramColor.multiplyScalar(2.8));
  diagramMaterial.opacity =
    state.mode === "bodyTransparent" && diagramMaterial.map
      ? state.diagramOverlayOpacity * group.userData.visualOpacity
      : 0;
  diagramMaterial.needsUpdate = true;

  const labelColor = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country]).offsetHSL(0, 0.04, 0.22)
    : new THREE.Color(0xf2f2ed);
  group.userData.label.material.color.copy(labelColor);
  group.userData.label.material.needsUpdate = true;
}

function updateDiagramOverlayControls() {
  const enabled = state.mode === "bodyTransparent";
  diagramOverlayInput.disabled = !enabled;
  exploreDiagramOverlayInput.disabled = !enabled;
  diagramOverlayControl.classList.toggle("is-disabled", !enabled);
  exploreDiagramOverlayControl.classList.toggle("is-disabled", !enabled);
}

function setDiagramOverlayOpacity(percent) {
  const boundedPercent = Math.min(100, Math.max(0, Number(percent)));
  state.diagramOverlayOpacity = boundedPercent / 100;
  diagramOverlayInput.value = String(boundedPercent);
  exploreDiagramOverlayInput.value = String(boundedPercent);
  diagramOverlayValue.value = `${Math.round(boundedPercent)}%`;
  exploreDiagramOverlayValue.value = `${Math.round(boundedPercent)}%`;
  poseObjects.forEach((group) => {
    group.userData.diagramOverlay.material.opacity =
      state.mode === "bodyTransparent" && group.userData.diagramOverlay.material.map
        ? state.diagramOverlayOpacity * group.userData.visualOpacity
        : 0;
  });
}

function updatePoseLabelVisibility() {
  poseObjects.forEach((group) => {
    group.userData.label.visible = state.poseLabels;
  });
}

function createAnchorObject(dimension) {
  const group = new THREE.Group();
  group.userData.dimension = dimension;
  group.userData.basePosition = new THREE.Vector3(...dimension.position);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 18, 12),
    new THREE.MeshBasicMaterial({
      color: dimension.color,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    }),
  );
  dot.renderOrder = 8;

  const texture = createLabelTexture(dimension.label, dimension.color);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const labelWidth = THREE.MathUtils.clamp(2.35 + dimension.label.length * 0.085, 2.8, 4.4);
  label.scale.set(labelWidth, labelWidth * 0.215, 1);
  label.position
    .set(...dimension.position)
    .normalize()
    .multiplyScalar(-0.78);
  label.renderOrder = 12;

  group.add(dot, label);
  anchorRoot.add(group);
  anchorObjects.set(dimension.key, group);
}

function createLineMesh(dimension) {
  const material = new THREE.MeshBasicMaterial({
    color: dimension.color,
    transparent: true,
    opacity: state.lineOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(
    cylinderGeometry,
    material,
    poseObjects.length * curveSegments,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  lineRoot.add(mesh);
  lineMeshes.set(dimension.key, mesh);
}

function composeConnection(start, end, radius, visible) {
  if (!visible) {
    transform.makeScale(0, 0, 0);
    return transform;
  }
  direction.subVectors(end, start);
  const length = direction.length();
  midpoint.addVectors(start, end).multiplyScalar(0.5);
  quaternion.setFromUnitVectors(cylinderAxis, direction.normalize());
  scale.set(radius, length, radius);
  return transform.compose(midpoint, quaternion, scale);
}

function quadraticPoint(start, control, end, t, target) {
  const inverse = 1 - t;
  return target
    .copy(start)
    .multiplyScalar(inverse * inverse)
    .addScaledVector(control, 2 * inverse * t)
    .addScaledVector(end, t * t);
}

function connectionControlPoint(start, end, poseIndex, dimensionIndex) {
  direction.subVectors(end, start);
  const length = direction.length();
  curveControl.addVectors(start, end).multiplyScalar(0.5);
  curveRadial.copy(curveControl);
  if (curveRadial.lengthSq() < 1e-8) curveRadial.set(0, 1, 0);
  curveRadial.normalize();
  curveNormal.crossVectors(direction, curveRadial);
  if (curveNormal.lengthSq() < 1e-8) curveNormal.crossVectors(direction, cylinderAxis);
  if (curveNormal.lengthSq() < 1e-8) curveNormal.set(1, 0, 0);
  curveNormal.normalize();
  const variation = Math.sin((poseIndex + 1) * 2.39996 + dimensionIndex * 1.61803);
  curveControl.addScaledVector(curveRadial, length * 0.18 + 0.24);
  curveControl.addScaledVector(curveNormal, variation * length * 0.055);
  return curveControl;
}

function updateConnections(revealWeights = null) {
  payload.dimensions.forEach((dimension, dimensionIndex) => {
    const mesh = lineMeshes.get(dimension.key);
    mesh.visible = state.linesVisible && state.visibleDimensions.has(dimension.key);
    const start = anchorObjects.get(dimension.key).position;
    poseObjects.forEach((poseObject, index) => {
      const pose = poseObject.userData.pose;
      const normalized = pose.normalized[dimension.key] / 100;
      const revealWeight = revealWeights ? revealWeights[index] : 1;
      const radius = (0.0008 + Math.pow(normalized, 1.65) * 0.026) * revealWeight;
      const visible = state.visibleCountries.has(pose.country) && revealWeight > 0.001;
      const instanceStart = index * curveSegments;

      if (state.lineStyle === "straight") {
        mesh.setMatrixAt(
          instanceStart,
          composeConnection(start, poseObject.position, radius, visible),
        );
        for (let segment = 1; segment < curveSegments; segment += 1) {
          mesh.setMatrixAt(instanceStart + segment, composeConnection(start, start, 0, false));
        }
        return;
      }

      const control = connectionControlPoint(start, poseObject.position, index, dimensionIndex);
      for (let segment = 0; segment < curveSegments; segment += 1) {
        const startT = segment / curveSegments;
        const endT = (segment + 1) / curveSegments;
        quadraticPoint(start, control, poseObject.position, startT, curvePointA);
        quadraticPoint(start, control, poseObject.position, endT, curvePointB);
        mesh.setMatrixAt(
          instanceStart + segment,
          composeConnection(curvePointA, curvePointB, radius, visible),
        );
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateLineOpacity(multiplier = 1) {
  lineMeshes.forEach((mesh) => {
    mesh.material.opacity = state.lineOpacity * multiplier;
    mesh.material.needsUpdate = true;
  });
}

function setAnchorOpacity(opacity) {
  anchorRoot.visible = opacity > 0.001;
  anchorObjects.forEach((group) => {
    group.children.forEach((child) => {
      child.material.opacity = opacity;
      child.material.needsUpdate = true;
    });
  });
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function poseDistance(firstPose, secondPose) {
  const squaredDistance = payload.dimensions.reduce((total, dimension) => {
    const difference =
      (firstPose.normalized[dimension.key] - secondPose.normalized[dimension.key]) / 100;
    return total + difference * difference;
  }, 0);
  return Math.sqrt(squaredDistance);
}

function rankPoseGroups(selectedGroup, candidates, farthest = false) {
  return candidates
    .filter((group) => group !== selectedGroup)
    .map((group) => ({
      group,
      distance: poseDistance(selectedGroup.userData.pose, group.userData.pose),
    }))
    .sort((first, second) => {
      const distanceOrder = farthest
        ? second.distance - first.distance
        : first.distance - second.distance;
      return distanceOrder || first.group.userData.pose.id.localeCompare(second.group.userData.pose.id);
    })
    .map(({ group }) => group);
}

function getComparisonGroups(mode) {
  const selectedGroup = exploration.selectedGroup;
  const farthest = mode.startsWith("different");
  if (mode.endsWith("all-countries")) {
    return Object.keys(payload.countryColors)
      .filter((country) => country !== selectedGroup.userData.pose.country)
      .map((country) =>
        rankPoseGroups(
          selectedGroup,
          poseObjects.filter((group) => group.userData.pose.country === country),
          farthest,
        )[0],
      )
      .filter(Boolean);
  }
  if (mode.endsWith("same-country")) {
    return rankPoseGroups(
      selectedGroup,
      poseObjects.filter(
        (group) => group.userData.pose.country === selectedGroup.userData.pose.country,
      ),
      farthest,
    ).slice(0, 6);
  }
  return rankPoseGroups(selectedGroup, poseObjects, farthest).slice(0, 6);
}

function setPoseTarget(group, opacity, poseScale) {
  group.userData.targetOpacity = opacity;
  group.userData.targetScale = poseScale;
  if (opacity > 0.001) group.visible = true;
}

function setPoseProminence(group, level = 0) {
  group.userData.image.renderOrder = level === 2 ? 11 : level === 1 ? 10 : 1;
  group.userData.image.material.depthTest = level === 0;
  group.userData.image.material.needsUpdate = true;
  group.userData.diagramOverlay.renderOrder = level === 2 ? 12 : level === 1 ? 11 : 2;
  group.userData.label.renderOrder = level === 2 ? 14 : level === 1 ? 13 : 4;
}

function updatePoseTransitions(deltaSeconds) {
  if (!exploration.active && !exploration.restoring) return;
  const transitionSpeed = exploration.restoring ? 6.5 : 4.6;
  const response = 1 - Math.exp(-deltaSeconds * (reducedMotion ? 40 : transitionSpeed));
  poseObjects.forEach((group) => {
    group.userData.visualOpacity = THREE.MathUtils.lerp(
      group.userData.visualOpacity,
      group.userData.targetOpacity,
      response,
    );
    group.userData.visualScale = THREE.MathUtils.lerp(
      group.userData.visualScale,
      group.userData.targetScale,
      response,
    );
    group.scale.setScalar(group.userData.visualScale);
    group.userData.image.material.opacity = group.userData.image.material.map
      ? group.userData.visualOpacity
      : 0;
    group.userData.diagramOverlay.material.opacity =
      state.mode === "bodyTransparent" && group.userData.diagramOverlay.material.map
        ? group.userData.visualOpacity * state.diagramOverlayOpacity
        : 0;
    group.userData.label.material.opacity = state.poseLabels
      ? group.userData.visualOpacity * 0.86
      : 0;
    if (group.userData.targetOpacity === 0 && group.userData.visualOpacity < 0.002) {
      group.visible = false;
    }
  });
}

function clearComparisonLines() {
  exploration.comparisonLines.forEach((line) => {
    comparisonLineRoot.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  exploration.comparisonLines = [];
  comparisonLineRoot.visible = false;
}

function createComparisonLines(relatedGroups) {
  clearComparisonLines();
  const selectedPosition = exploration.selectedGroup.position;
  const pointCount = 52;
  relatedGroups.forEach((group, index) => {
    const points = [];
    if (state.lineStyle === "straight") {
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        points.push(
          new THREE.Vector3().lerpVectors(
            selectedPosition,
            group.position,
            pointIndex / (pointCount - 1),
          ),
        );
      }
    } else {
      const control = new THREE.Vector3()
        .addVectors(selectedPosition, group.position)
        .multiplyScalar(0.5);
      const radial = control.clone();
      if (radial.lengthSq() < 1e-6) radial.set(0, 1, 0);
      radial.normalize();
      const connectionLength = selectedPosition.distanceTo(group.position);
      control.addScaledVector(radial, 0.3 + connectionLength * 0.13);
      const curve = new THREE.QuadraticBezierCurve3(selectedPosition, control, group.position);
      points.push(...curve.getPoints(pointCount - 1));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 0);
    const countryColor = payload.countryColors[group.userData.pose.country];
    const material = new THREE.LineBasicMaterial({
      color: countryColor,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 16;
    line.userData.pointCount = points.length;
    line.userData.animationIndex = index;
    comparisonLineRoot.add(line);
    exploration.comparisonLines.push(line);
  });
  comparisonLineRoot.visible = true;
  exploration.lineAnimationStart = performance.now() + 120;
}

function updateComparisonLineAnimation(time) {
  if (!exploration.active || exploration.comparisonLines.length === 0) return;
  exploration.comparisonLines.forEach((line) => {
    const delay = line.userData.animationIndex * 105;
    const progress = smoothstep((time - exploration.lineAnimationStart - delay) / 900);
    const visiblePoints = progress <= 0
      ? 0
      : Math.max(2, Math.ceil(line.userData.pointCount * progress));
    line.geometry.setDrawRange(0, visiblePoints);
    line.material.opacity = progress * 0.82;
  });
}

function startCameraTween(endPosition, endTarget, onComplete = null, duration = 1250) {
  controls.enabled = false;
  exploration.cameraTween = {
    startTime: performance.now(),
    duration: reducedMotion ? 80 : duration,
    startPosition: camera.position.clone(),
    endPosition: endPosition.clone(),
    startTarget: controls.target.clone(),
    endTarget: endTarget.clone(),
    onComplete,
  };
}

function updateCameraTween(time) {
  const tween = exploration.cameraTween;
  if (!tween) return false;
  const progress = clamp01((time - tween.startTime) / tween.duration);
  const easedProgress = easeInOutCubic(progress);
  camera.position.lerpVectors(tween.startPosition, tween.endPosition, easedProgress);
  controls.target.lerpVectors(tween.startTarget, tween.endTarget, easedProgress);
  camera.lookAt(controls.target);
  if (progress >= 1) {
    exploration.cameraTween = null;
    if (tween.onComplete) tween.onComplete();
  }
  return true;
}

function focusCameraOnGroups(groups) {
  const bounds = new THREE.Box3();
  groups.forEach((group) => bounds.expandByPoint(group.position));
  const target = bounds.getCenter(new THREE.Vector3());
  const radius = groups.reduce(
    (largest, group) => Math.max(largest, group.position.distanceTo(target)),
    0,
  );
  const viewDirection = camera.position.clone().sub(controls.target);
  if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0, 1);
  viewDirection.normalize();
  const distance = THREE.MathUtils.clamp(
    Math.max(4.4, (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 1.18),
    4.4,
    52,
  );
  const endPosition = target.clone().addScaledVector(viewDirection, distance);
  startCameraTween(endPosition, target, () => {
    controls.enabled = exploration.active;
  });
}

function resetComparisonPresentation() {
  clearComparisonLines();
  lineRoot.visible = false;
  anchorRoot.visible = false;
  comparisonButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function selectPose(group) {
  if (!group || opening.active || exploration.restoring) return;
  if (!exploration.active) {
    exploration.savedCameraPosition.copy(camera.position);
    exploration.savedCameraTarget.copy(controls.target);
    exploration.savedAutoRotate = controls.autoRotate;
  }

  exploration.active = true;
  exploration.selectedGroup = group;
  exploration.relatedGroups = new Set();
  exploration.comparisonMode = null;
  controls.autoRotate = false;
  openSettings(false);
  tooltip.classList.remove("is-visible");
  canvas.classList.remove("is-pose-hovered");
  document.body.classList.add("explore-active");
  explorePanel.classList.add("is-open");
  explorePanel.setAttribute("aria-hidden", "false");
  selectedPoseName.textContent = `${group.userData.pose.countryLabel} · Pose ${group.userData.pose.number}`;
  exploreStatus.textContent = "Choose how to compare this dance.";
  exploreDisplayModeInput.value = state.mode;

  resetComparisonPresentation();
  poseObjects.forEach((poseGroup) => {
    const selected = poseGroup === group;
    const countryVisible = state.visibleCountries.has(poseGroup.userData.pose.country);
    setPoseTarget(poseGroup, selected ? 1 : countryVisible ? 0.18 : 0, selected ? 1.5 : 1);
    setPoseProminence(poseGroup, selected ? 2 : 0);
  });
  focusCameraOnGroups([group]);
}

function comparisonStatus(mode, count) {
  const allCountryCount = Object.keys(payload.countryColors).length;
  const descriptions = {
    similar: `${count} closest dances across the full collection`,
    different: `${count} most different dances across the full collection`,
    "similar-all-countries": `${allCountryCount} dances, one closest match per country`,
    "different-all-countries": `${allCountryCount} dances, one farthest match per country`,
    "similar-same-country": `${count} closest dances from the same country`,
    "different-same-country": `${count} most different dances from the same country`,
  };
  return descriptions[mode];
}

function applyComparison(mode) {
  if (!exploration.active || !exploration.selectedGroup) return;
  const relatedGroups = getComparisonGroups(mode);
  exploration.comparisonMode = mode;
  exploration.relatedGroups = new Set(relatedGroups);
  comparisonButtons.forEach((button) => {
    const active = button.dataset.comparison === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  poseObjects.forEach((group) => {
    const selected = group === exploration.selectedGroup;
    const related = exploration.relatedGroups.has(group);
    const relevant = selected || related;
    const countryVisible = state.visibleCountries.has(group.userData.pose.country);
    setPoseTarget(
      group,
      relevant ? 1 : countryVisible ? 0.025 : 0,
      selected ? 1.5 : related ? 2 : 0.92,
    );
    setPoseProminence(group, selected ? 2 : related ? 1 : 0);
  });
  lineRoot.visible = false;
  anchorRoot.visible = false;
  createComparisonLines(relatedGroups);
  exploreStatus.textContent = comparisonStatus(mode, relatedGroups.length);
  focusCameraOnGroups([exploration.selectedGroup, ...relatedGroups]);
}

function exitExploration() {
  if (!exploration.active) return;
  exploration.active = false;
  exploration.restoring = true;
  exploration.selectedGroup = null;
  exploration.relatedGroups = new Set();
  exploration.comparisonMode = null;
  document.body.classList.remove("explore-active");
  explorePanel.classList.remove("is-open");
  explorePanel.setAttribute("aria-hidden", "true");
  clearComparisonLines();
  lineRoot.visible = state.linesVisible;
  setAnchorOpacity(1);
  updateDimensionVisibility();
  updateConnections();
  updateLineOpacity();

  poseObjects.forEach((group) => {
    const countryVisible = state.visibleCountries.has(group.userData.pose.country);
    setPoseTarget(group, countryVisible ? 1 : 0, 1);
    setPoseProminence(group, 0);
  });
  controls.autoRotate = false;
  startCameraTween(
    exploration.savedCameraPosition,
    exploration.savedCameraTarget,
    () => {
      exploration.restoring = false;
      controls.enabled = true;
      controls.autoRotate = exploration.savedAutoRotate;
      poseObjects.forEach((group) => {
        const countryVisible = state.visibleCountries.has(group.userData.pose.country);
        group.userData.visualOpacity = countryVisible ? 1 : 0;
        group.userData.targetOpacity = countryVisible ? 1 : 0;
        group.userData.visualScale = 1;
        group.userData.targetScale = 1;
        group.scale.setScalar(1);
        group.visible = countryVisible;
        group.userData.image.material.opacity = countryVisible && group.userData.image.material.map ? 1 : 0;
        group.userData.diagramOverlay.material.opacity =
          countryVisible &&
          state.mode === "bodyTransparent" &&
          group.userData.diagramOverlay.material.map
            ? state.diagramOverlayOpacity
            : 0;
        group.userData.label.material.opacity = countryVisible && state.poseLabels ? 0.86 : 0;
      });
    },
    850,
  );
}

function selectRandomPose() {
  if (opening.active || exploration.active || exploration.restoring) return;
  const candidates = poseObjects.filter(
    (group) =>
      state.visibleCountries.has(group.userData.pose.country) && group.userData.image.material.map,
  );
  if (candidates.length === 0) return;
  selectPose(candidates[Math.floor(Math.random() * candidates.length)]);
}

function prepareRevealOrder() {
  const ordered = [...poseObjects].sort((first, second) => {
    const firstDistance = first.userData.basePosition.length();
    const secondDistance = second.userData.basePosition.length();
    return firstDistance - secondDistance;
  });
  ordered.forEach((group, index) => {
    group.userData.revealOrder = index / Math.max(ordered.length - 1, 1);
  });
}

function startOpeningScene() {
  if (opening.active) return;
  opening.active = true;
  opening.startTime = performance.now();
  opening.savedAutoRotate = controls.autoRotate;
  document.body.classList.add("opening-active");
  document.body.dataset.opening = "playing";
  playOpeningButton.disabled = true;
  randomPoseButton.disabled = true;
  playOpeningButton.textContent = "Opening scene…";
  openSettings(false);
  tooltip.classList.remove("is-visible");

  controls.autoRotate = false;
  controls.enabled = false;
  controls.target.set(0, 0, 0);
  camera.position.copy(opening.cameraStart);
  opening.cameraOrbitStartAngle = Math.atan2(camera.position.x, camera.position.z);
  camera.lookAt(controls.target);

  setPoseRotationEnabled(true, true);

  prepareRevealOrder();
  if (!opening.revealWeights || opening.revealWeights.length !== poseObjects.length) {
    opening.revealWeights = new Float32Array(poseObjects.length);
  }
  opening.revealWeights.fill(0);
  opening.lastConnectionUpdate = 0;
  poseObjects.forEach((group) => {
    group.scale.setScalar(0.001);
    group.visible = false;
    group.userData.image.material.opacity = 0;
    group.userData.diagramOverlay.material.opacity = 0;
    group.userData.label.material.opacity = 0;
  });
  lineRoot.visible = state.linesVisible;
  updateConnections(opening.revealWeights);
  updateLineOpacity();
  setAnchorOpacity(0);
}

function finishOpeningScene() {
  opening.active = false;
  document.body.classList.remove("opening-active");
  document.body.dataset.opening = "idle";
  playOpeningButton.disabled = false;
  randomPoseButton.disabled = false;
  playOpeningButton.innerHTML = '<span aria-hidden="true">▶</span> Play opening scene';

  poseObjects.forEach((group) => {
    group.scale.setScalar(1);
    group.visible = state.visibleCountries.has(group.userData.pose.country);
    group.userData.image.material.opacity = group.userData.image.material.map ? 1 : 0;
    group.userData.diagramOverlay.material.opacity =
      state.mode === "bodyTransparent" && group.userData.diagramOverlay.material.map
        ? state.diagramOverlayOpacity
        : 0;
    group.userData.label.material.opacity = state.poseLabels ? 0.86 : 0;
  });
  lineRoot.visible = state.linesVisible;
  updateConnections();
  setAnchorOpacity(1);
  updateDimensionVisibility();
  updateLineOpacity();

  controls.target.set(0, 0, 0);
  controls.enabled = true;
  controls.autoRotate = opening.savedAutoRotate;
  controls.update();
}

function updateOpeningScene(time) {
  const progress = clamp01((time - opening.startTime) / opening.duration);
  const cameraProgress = easeInOutCubic(progress);
  const orbitElapsed = Math.max(0, time - opening.startTime) / 1000;
  const orbitAngle = opening.cameraOrbitStartAngle - orbitElapsed * opening.cameraOrbitSpeed;
  const cameraRadius = THREE.MathUtils.lerp(
    Math.hypot(opening.cameraStart.x, opening.cameraStart.z),
    Math.hypot(opening.cameraEnd.x, opening.cameraEnd.z),
    cameraProgress,
  );
  camera.position.set(
    Math.sin(orbitAngle) * cameraRadius,
    THREE.MathUtils.lerp(opening.cameraStart.y, opening.cameraEnd.y, cameraProgress),
    Math.cos(orbitAngle) * cameraRadius,
  );
  camera.lookAt(controls.target);

  const revealProgress = clamp01(progress / 0.78);
  poseObjects.forEach((group, index) => {
    const start = group.userData.revealOrder * 0.86;
    const localProgress = smoothstep((revealProgress - start) / 0.14);
    const countryVisible = state.visibleCountries.has(group.userData.pose.country);
    group.visible = countryVisible && localProgress > 0.001;
    group.scale.setScalar(Math.max(localProgress, 0.001));
    group.userData.image.material.opacity = localProgress;
    group.userData.diagramOverlay.material.opacity =
      state.mode === "bodyTransparent" && group.userData.diagramOverlay.material.map
        ? localProgress * state.diagramOverlayOpacity
        : 0;
    group.userData.label.material.opacity = state.poseLabels ? localProgress * 0.86 : 0;
    opening.revealWeights[index] = countryVisible ? localProgress : 0;
  });

  lineRoot.visible = state.linesVisible;
  if (state.linesVisible && (time - opening.lastConnectionUpdate >= 32 || progress >= 1)) {
    updateConnections(opening.revealWeights);
    opening.lastConnectionUpdate = time;
  }
  setAnchorOpacity(smoothstep(progress / 0.12));

  if (progress >= 1) finishOpeningScene();
}

function updatePoseRotations(timeSeconds) {
  if (!state.poseRotation) {
    lastPoseRotationTime = timeSeconds;
    return;
  }
  if (lastPoseRotationTime === null) lastPoseRotationTime = timeSeconds;
  const elapsed = THREE.MathUtils.clamp(timeSeconds - lastPoseRotationTime, 0, 0.1);
  const radiansPerSecond = THREE.MathUtils.degToRad(state.poseRotationSpeed);
  poseObjects.forEach((group) => {
    // Turn each camera-facing image like a vertical card around its local Y axis.
    group.userData.image.rotation.y +=
      elapsed * radiansPerSecond * group.userData.rotationDirection;
  });
  lastPoseRotationTime = timeSeconds;
}

function resetPoseRotations() {
  poseObjects.forEach((group) => {
    group.userData.image.rotation.set(0, 0, 0);
  });
}

function setPoseRotationEnabled(enabled, resetPhase = false) {
  state.poseRotation = enabled;
  poseRotationInput.checked = enabled;
  rotationSpeedInput.disabled = !enabled;
  lastPoseRotationTime = performance.now() / 1000;
  if (!enabled) {
    resetPoseRotations();
    return;
  }
  if (resetPhase) {
    poseObjects.forEach((group) => {
      group.userData.image.rotation.set(0, group.userData.rotationStart, 0);
    });
  }
}

function updateImageBillboards() {
  poseObjects.forEach((group) => {
    group.userData.billboard.quaternion.copy(camera.quaternion);
  });
}

function updateSpatialLayout() {
  poseObjects.forEach((group) => {
    group.position.copy(group.userData.basePosition).multiplyScalar(state.spaceScale);
  });
  anchorObjects.forEach((group) => {
    group.position.copy(group.userData.basePosition).multiplyScalar(state.spaceScale);
  });
  updateConnections();
}

function updateCountryVisibility() {
  poseObjects.forEach((group) => {
    group.visible = state.visibleCountries.has(group.userData.pose.country);
  });
  const allVisible = state.visibleCountries.size === Object.keys(payload.countryColors).length;
  toggleCountriesButton.textContent = allVisible ? "Hide all" : "Show all";
  updateConnections();
}

function updateCountryColors() {
  poseObjects.forEach(updatePoseAppearance);
}

function updateDimensionVisibility() {
  lineMeshes.forEach((mesh, key) => {
    mesh.visible = state.linesVisible && state.visibleDimensions.has(key);
  });
}

function buildSettings() {
  payload.dimensions.forEach((dimension) => {
    state.visibleDimensions.add(dimension.key);
    const label = document.createElement("label");
    label.className = "check-row";
    label.htmlFor = `dimension-${dimension.key}`;
    label.innerHTML = `
      <span class="swatch" style="color:${dimension.color};background:${dimension.color}"></span>
      <span>${dimension.label}</span>
      <input id="dimension-${dimension.key}" type="checkbox" checked />
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.visibleDimensions.add(dimension.key);
      else state.visibleDimensions.delete(dimension.key);
      updateDimensionVisibility();
    });
    dimensionInputs.set(dimension.key, input);
    dimensionList.append(label);
  });

  Object.entries(payload.countryColors).forEach(([country, color]) => {
    state.visibleCountries.add(country);
    const label = document.createElement("label");
    label.className = "check-row";
    label.htmlFor = `country-${country}`;
    label.innerHTML = `
      <span class="swatch" style="color:${color};background:${color}"></span>
      <span>${country.replaceAll("_", " ")}</span>
      <input id="country-${country}" type="checkbox" checked />
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.visibleCountries.add(country);
      else state.visibleCountries.delete(country);
      updateCountryVisibility();
    });
    countryInputs.set(country, input);
    countryList.append(label);
  });
}

async function loadTexture(path, mode) {
  const texture = await textureLoader.loadAsync(resolveAssetUrl(path));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  if (mode !== "body") {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  return texture;
}

async function loadPoseMode(mode) {
  const generation = ++textureGeneration;
  state.mode = mode;
  displayModeInput.value = mode;
  exploreDisplayModeInput.value = mode;
  updateDiagramOverlayControls();
  setLoading(`Loading ${modeLabels[mode]}…`, 0);

  poseObjects.forEach((group) => {
    group.userData.image.material.map = null;
    group.userData.image.material.opacity = 0;
    group.userData.image.material.needsUpdate = true;
    group.userData.diagramOverlay.material.map = null;
    group.userData.diagramOverlay.material.opacity = 0;
    group.userData.diagramOverlay.material.needsUpdate = true;
    updatePoseScale(group);
    updatePoseAppearance(group);
  });
  activeTextures.forEach((texture) => texture.dispose());
  activeTextures = [];

  let cursor = 0;
  let completed = 0;
  const loadedTextures = [];
  const workerCount = 12;

  async function worker() {
    while (cursor < poseObjects.length && generation === textureGeneration) {
      const index = cursor++;
      const group = poseObjects[index];
      const pose = group.userData.pose;
      try {
        const textureRequests = [loadTexture(pose.assets[mode], mode)];
        if (mode === "bodyTransparent") {
          textureRequests.push(loadTexture(pose.assets.diagram, "diagram"));
        }
        const results = await Promise.allSettled(textureRequests);
        const textures = results
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        if (generation !== textureGeneration) {
          textures.forEach((texture) => texture.dispose());
          return;
        }
        loadedTextures.push(...textures);
        if (results[0].status === "rejected") throw results[0].reason;
        group.userData.image.material.map = results[0].value;
        if (mode === "bodyTransparent" && results[1]?.status === "fulfilled") {
          group.userData.diagramOverlay.material.map = results[1].value;
        } else if (results[1]?.status === "rejected") {
          console.warn(`Could not load diagram overlay for ${pose.id}`, results[1].reason);
        }
        updatePoseAppearance(group);
      } catch (error) {
        console.error(`Could not load ${pose.id} (${mode})`, error);
      }
      completed += 1;
      if (completed % 12 === 0 || completed === poseObjects.length) {
        setLoading(`Loading ${modeLabels[mode]}…`, Math.round((completed / poseObjects.length) * 100));
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  if (generation === textureGeneration) {
    activeTextures = loadedTextures;
    hideLoading();
  } else {
    loadedTextures.forEach((texture) => texture.dispose());
  }
}

function openSettings(open) {
  settingsPanel.classList.toggle("is-open", open);
  settingsPanel.setAttribute("aria-hidden", String(!open));
  settingsButton.setAttribute("aria-expanded", String(open));
  if (open) closeSettingsButton.focus();
}

function getPoseIntersection(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const selectableImages = poseObjects
    .filter(
      (group) =>
        group.visible &&
        group.userData.visualOpacity > 0.18 &&
        group.userData.image.material.map,
    )
    .map((group) => group.userData.image);
  return raycaster.intersectObjects(selectableImages, false)[0] || null;
}

function updateTooltip(event) {
  if (settingsPanel.classList.contains("is-open") || opening.active) {
    tooltip.classList.remove("is-visible");
    canvas.classList.remove("is-pose-hovered");
    return;
  }
  const intersection = getPoseIntersection(event);
  canvas.classList.toggle("is-pose-hovered", Boolean(intersection));
  if (!intersection) {
    tooltip.classList.remove("is-visible");
    return;
  }

  const pose = intersection.object.userData.pose;
  const strongest = payload.dimensions
    .map((dimension) => ({
      label: dimension.label,
      value: pose.normalized[dimension.key],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(({ label, value }) => `${label} ${Math.round(value)}%`)
    .join(" · ");
  tooltip.innerHTML = `<strong>${pose.countryLabel} · Pose ${pose.number}</strong><span>${strongest}</span>`;
  tooltip.style.left = `${Math.min(event.clientX, window.innerWidth - 250)}px`;
  tooltip.style.top = `${Math.min(event.clientY, window.innerHeight - 85)}px`;
  tooltip.classList.add("is-visible");
}

function bindEvents() {
  settingsButton.addEventListener("click", () => openSettings(true));
  closeSettingsButton.addEventListener("click", () => openSettings(false));
  randomPoseButton.addEventListener("click", selectRandomPose);
  closeExploreButton.addEventListener("click", exitExploration);
  comparisonButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyComparison(button.dataset.comparison));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (exploration.active) exitExploration();
    else openSettings(false);
  });

  displayModeInput.addEventListener("change", () => loadPoseMode(displayModeInput.value));
  exploreDisplayModeInput.addEventListener("change", () =>
    loadPoseMode(exploreDisplayModeInput.value),
  );
  diagramOverlayInput.addEventListener("input", () => {
    setDiagramOverlayOpacity(diagramOverlayInput.value);
  });
  exploreDiagramOverlayInput.addEventListener("input", () => {
    setDiagramOverlayOpacity(exploreDiagramOverlayInput.value);
  });
  countryColorsInput.addEventListener("change", () => {
    state.countryColors = countryColorsInput.checked;
    updateCountryColors();
  });
  autoRotateInput.addEventListener("change", () => {
    controls.autoRotate = autoRotateInput.checked;
  });
  poseRotationInput.addEventListener("change", () => {
    setPoseRotationEnabled(poseRotationInput.checked, poseRotationInput.checked);
  });
  rotationSpeedInput.addEventListener("input", () => {
    state.poseRotationSpeed = Number(rotationSpeedInput.value);
    rotationSpeedValue.value = `${state.poseRotationSpeed.toFixed(1).replace(".0", "")}°/s`;
  });
  poseLabelsInput.addEventListener("change", () => {
    state.poseLabels = poseLabelsInput.checked;
    poseLabelSizeInput.disabled = !state.poseLabels;
    updatePoseLabelVisibility();
    poseObjects.forEach((group) => {
      group.userData.label.material.opacity = state.poseLabels ? 0.86 : 0;
    });
  });
  poseLabelSizeInput.addEventListener("input", () => {
    state.poseLabelScale = Number(poseLabelSizeInput.value);
    poseLabelSizeValue.value = `${state.poseLabelScale.toFixed(2)}×`;
    poseObjects.forEach(updatePoseScale);
  });
  playOpeningButton.addEventListener("click", startOpeningScene);
  imageScaleInput.addEventListener("input", () => {
    state.poseScale = Number(imageScaleInput.value);
    imageScaleValue.value = `${state.poseScale.toFixed(2)}×`;
    poseObjects.forEach(updatePoseScale);
  });
  spaceScaleInput.addEventListener("input", () => {
    state.spaceScale = Number(spaceScaleInput.value);
    spaceScaleValue.value = `${state.spaceScale.toFixed(2)}×`;
    updateSpatialLayout();
  });
  showLinesInput.addEventListener("change", () => {
    state.linesVisible = showLinesInput.checked;
    updateDimensionVisibility();
  });
  lineStyleInput.addEventListener("change", () => {
    state.lineStyle = lineStyleInput.value;
    updateConnections();
  });
  lineOpacityInput.addEventListener("input", () => {
    state.lineOpacity = Number(lineOpacityInput.value);
    lineOpacityValue.value = `${Math.round(state.lineOpacity * 100)}%`;
    updateLineOpacity();
  });
  toggleCountriesButton.addEventListener("click", () => {
    const countries = Object.keys(payload.countryColors);
    const hide = state.visibleCountries.size === countries.length;
    state.visibleCountries.clear();
    if (!hide) countries.forEach((country) => state.visibleCountries.add(country));
    countryInputs.forEach((input, country) => {
      input.checked = state.visibleCountries.has(country);
    });
    updateCountryVisibility();
  });

  renderer.domElement.addEventListener("pointermove", updateTooltip);
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    exploration.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    const pointerDown = exploration.pointerDown;
    exploration.pointerDown = null;
    if (!pointerDown || event.button !== 0 || opening.active || exploration.restoring) return;
    const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    if (movement > 6 || performance.now() - pointerDown.time > 650) return;
    const intersection = getPoseIntersection(event);
    if (intersection) selectPose(intersection.object.userData.poseGroup);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    exploration.pointerDown = null;
    tooltip.classList.remove("is-visible");
    canvas.classList.remove("is-pose-hovered");
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });
}

async function initialize() {
  try {
    setLoading("Loading embedding…");
    const response = await fetch(`${baseUrl}data/embedding.json`);
    if (!response.ok) throw new Error(`Embedding request failed: ${response.status}`);
    payload = await response.json();

    buildSettings();
    payload.poses.forEach(createPoseObject);
    payload.dimensions.forEach(createAnchorObject);
    payload.dimensions.forEach(createLineMesh);
    updateSpatialLayout();
    updateCountryColors();
    bindEvents();
    updateDiagramOverlayControls();
    setDiagramOverlayOpacity(diagramOverlayInput.value);
    await loadPoseMode(state.mode);
    poseObjects.forEach((group) => {
      group.userData.label.material.opacity = state.poseLabels ? 0.86 : 0;
    });
    playOpeningButton.disabled = false;
    randomPoseButton.disabled = false;
    document.body.dataset.opening = "idle";
  } catch (error) {
    console.error(error);
    loadingLabel.textContent = "Unable to load the pose space";
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  if (opening.active) {
    updateOpeningScene(now);
  } else {
    const cameraIsTweening = updateCameraTween(now);
    if (!cameraIsTweening) controls.update();
    updatePoseTransitions(deltaSeconds);
  }
  updateComparisonLineAnimation(now);
  updateImageBillboards();
  updatePoseRotations(now / 1000);
  renderer.render(scene, camera);
});

initialize();
