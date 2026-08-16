import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./styles.css";
import presentationOutlineMarkdown from "../presentation_outline.md?raw";

const canvas = document.querySelector("#scene");
const presentationButton = document.querySelector("#presentation-button");
const presentationButtonLabel = document.querySelector("#presentation-button-label");
const presentationTitle = document.querySelector("#presentation-title");
const presentationTitleLabel = document.querySelector("#presentation-title-label");
const presentationTitleDescription = document.querySelector("#presentation-title-description");
const presentationBlackout = document.querySelector("#presentation-blackout");
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const closeSettingsButton = document.querySelector("#close-settings");
const embeddingVersionInput = document.querySelector("#embedding-version");
const displayModeInput = document.querySelector("#display-mode");
const diagramOverlayInput = document.querySelector("#diagram-overlay-opacity");
const diagramOverlayValue = document.querySelector("#diagram-overlay-opacity-value");
const diagramOverlayControl = document.querySelector(".diagram-overlay-control");
const countryColorsInput = document.querySelector("#country-colors");
const autoRotateInput = document.querySelector("#auto-rotate");
const poseRotationInput = document.querySelector("#pose-rotation");
const rotationSpeedInput = document.querySelector("#rotation-speed");
const rotationSpeedValue = document.querySelector("#rotation-speed-value");
const transitionTimeInput = document.querySelector("#transition-time");
const transitionTimeValue = document.querySelector("#transition-time-value");
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
const embeddingFiles = {
  v1: "data/embedding-v1.json",
  v2: "data/embedding-v2.json",
  v3: "data/embedding-v3.json",
};
const state = {
  embeddingVersion: "v1",
  mode: "bodyTransparent",
  diagramOverlayOpacity: Number(diagramOverlayInput.value) / 100,
  poseScale: Number(imageScaleInput.value),
  spaceScale: Number(spaceScaleInput.value),
  countryColors: countryColorsInput.checked,
  poseRotation: poseRotationInput.checked,
  poseRotationSpeed: Number(rotationSpeedInput.value),
  transitionTime: Number(transitionTimeInput.value),
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
let embeddingGeneration = 0;
const preloadedTextures = [];
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

const presentation = {
  active: false,
  busy: false,
  index: -1,
  slides: [],
  fullscreenRequested: false,
  countryTransitioning: false,
  countryTransitionGeneration: 0,
  countryTransitionDuration: 2.5,
  navigationGeneration: 0,
  mapRotation: false,
  savedAutoRotate: false,
  modeTransitioning: false,
  modeTransitionTarget: null,
  modeTransitionDestination: null,
  modeTransitionGeneration: 0,
};

const openingFinalOrbitAngle =
  Math.atan2(opening.cameraStart.x, opening.cameraStart.z) -
  (opening.duration / 1000) * opening.cameraOrbitSpeed;
const openingFinalCameraRadius = Math.hypot(opening.cameraEnd.x, opening.cameraEnd.z);
const presentationHomePosition = new THREE.Vector3(
  Math.sin(openingFinalOrbitAngle) * openingFinalCameraRadius,
  opening.cameraEnd.y,
  Math.cos(openingFinalOrbitAngle) * openingFinalCameraRadius,
);
const presentationHomeTarget = new THREE.Vector3(0, 0, 0);
const presentationComparisonTitles = {
  similar: "Similar Dances Across the Collection",
  different: "Most Different Dances Across the Collection",
  "similar-all-countries": "Similar Dances from Every Country",
  "different-all-countries": "Most Different Dances from Every Country",
  "similar-same-country": "Similar Dances Within {country}",
  "different-same-country": "Most Different Dances Within {country}",
};

const cylinderAxis = new THREE.Vector3(0, 1, 0);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const curveSegments = 12;
const connectionRadiusScale = 1.9;
const comparisonConnectionRadius = 0.01125;
const poseModeFadeDuration = 500;
const poseModeMaximumStagger = 750;
const poseLabelScaleStartDistance = 14;
const poseLabelScaleExponent = 0.55;
const poseLabelMinimumScale = 0.38;
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
const poseLabelWorldPosition = new THREE.Vector3();
const poseTransitionWorldPosition = new THREE.Vector3();

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

async function fetchEmbedding(version) {
  const path = embeddingFiles[version];
  if (!path) throw new Error(`Unknown embedding version: ${version}`);
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${version.toUpperCase()} embedding request failed: ${response.status}`);
  }
  return response.json();
}

function applyEmbeddingPayload(nextPayload) {
  if (nextPayload.poses.length !== poseObjects.length) {
    throw new Error("Embedding versions contain different pose counts");
  }
  const nextPoses = new Map(nextPayload.poses.map((pose) => [pose.id, pose]));
  const nextDimensions = new Map(
    nextPayload.dimensions.map((dimension) => [dimension.key, dimension]),
  );
  if (
    poseObjects.some((group) => !nextPoses.has(group.userData.pose.id)) ||
    [...anchorObjects.keys()].some((key) => !nextDimensions.has(key))
  ) {
    throw new Error("Embedding versions do not describe the same pose space");
  }

  payload = nextPayload;
  poseObjects.forEach((group) => {
    const pose = nextPoses.get(group.userData.pose.id);
    group.userData.pose = pose;
    group.userData.basePosition.set(...pose.position);
    group.userData.image.userData.pose = pose;
    updatePoseScale(group);
  });
  anchorObjects.forEach((group, key) => {
    const dimension = nextDimensions.get(key);
    group.userData.dimension = dimension;
    group.userData.basePosition.set(...dimension.position);
    group.children[1].position
      .set(...dimension.position)
      .normalize()
      .multiplyScalar(-0.78);
  });
  prepareRevealOrder();
  updateSpatialLayout();
  updateCountryColors();
  updateCountryVisibility();
  tooltip.classList.remove("is-visible");
  canvas.classList.remove("is-pose-hovered");
}

async function switchEmbeddingVersion(version) {
  if (version === state.embeddingVersion) return;
  const previousVersion = state.embeddingVersion;
  const generation = ++embeddingGeneration;
  embeddingVersionInput.disabled = true;
  setLoading(`Loading ${version.toUpperCase()} embedding…`);
  try {
    const nextPayload = await fetchEmbedding(version);
    if (generation !== embeddingGeneration) return;
    if (opening.active) finishOpeningScene();
    if (exploration.active) exitExploration();
    applyEmbeddingPayload(nextPayload);
    state.embeddingVersion = version;
    embeddingVersionInput.value = version;
    document.body.dataset.embeddingVersion = version;
    hideLoading();
  } catch (error) {
    console.error(error);
    embeddingVersionInput.value = previousVersion;
    loadingLabel.textContent = `Unable to load ${version.toUpperCase()}`;
    window.setTimeout(hideLoading, 1600);
  } finally {
    if (generation === embeddingGeneration) embeddingVersionInput.disabled = false;
  }
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
  const font = '400 58px "Helvetica Neue", Helvetica, Arial, sans-serif';
  const horizontalPadding = 64;
  const measurementContext = labelCanvas.getContext("2d");
  measurementContext.font = font;
  const measuredWidth = Math.ceil(measurementContext.measureText(label).width);
  labelCanvas.width = Math.max(512, measuredWidth + horizontalPadding * 2);
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.95)";
  context.shadowBlur = 14;
  context.fillText(label, labelCanvas.width * 0.5, labelCanvas.height * 0.5);
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
  group.userData.modeTransitionDelay = 0;
  group.userData.modeTransitionStartProgress = 0;
  group.userData.modeTransitionProgress = 0;
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

  const transitionImage = new THREE.Mesh(posePlaneGeometry, imageMaterial.clone());
  transitionImage.position.z = 0.004;
  transitionImage.renderOrder = 2;
  transitionImage.visible = false;
  transitionImage.raycast = () => {};
  const transitionDiagramOverlay = new THREE.Mesh(
    posePlaneGeometry,
    diagramOverlay.material.clone(),
  );
  transitionDiagramOverlay.position.z = 0.002;
  transitionDiagramOverlay.renderOrder = 3;
  transitionImage.add(transitionDiagramOverlay);
  billboard.add(image, transitionImage);

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
  group.userData.transitionImage = transitionImage;
  group.userData.transitionDiagramOverlay = transitionDiagramOverlay;
  group.userData.label = poseLabel;
  group.userData.labelText = poseLabelText;
  poseRoot.add(group);
  poseObjects.push(group);
  updatePoseScale(group);
  updatePoseAppearance(group);
  return group;
}

function updatePoseLayerScale(group, image, mode) {
  const pose = group.userData.pose;
  const aspect = pose.aspect[mode] || 1;
  const height = 0.72 * state.poseScale;
  image.scale.set(height * aspect, height, 1);
  return height;
}

function updatePoseScale(group) {
  const height = updatePoseLayerScale(group, group.userData.image, state.mode);
  if (presentation.modeTransitioning && presentation.modeTransitionTarget) {
    updatePoseLayerScale(
      group,
      group.userData.transitionImage,
      presentation.modeTransitionTarget,
    );
  }
  const labelWidth = THREE.MathUtils.clamp(
    0.28 + group.userData.labelText.length * 0.045,
    0.78,
    1.56,
  ) * state.poseScale * state.poseLabelScale;
  const labelHeight = 0.19 * state.poseScale * state.poseLabelScale;
  group.userData.labelBaseWidth = labelWidth;
  group.userData.labelBaseHeight = labelHeight;
  group.userData.imageBaseHeight = height;
  group.userData.label.scale.set(labelWidth, labelHeight, 1);
  group.userData.label.position.set(
    0,
    -height * 0.5 - labelHeight * 0.58 - 0.012 * state.poseScale,
    0,
  );
}

function updateAdaptivePoseLabels() {
  poseObjects.forEach((group) => {
    group.getWorldPosition(poseLabelWorldPosition);
    const distance = camera.position.distanceTo(poseLabelWorldPosition);
    const distanceRatio = Math.min(1, distance / poseLabelScaleStartDistance);
    const cameraScale = Math.max(
      poseLabelMinimumScale,
      Math.pow(distanceRatio, poseLabelScaleExponent),
    );
    const visualScale = Math.max(group.userData.visualScale || 1, 0.001);
    const localScale = cameraScale / visualScale;
    const labelWidth = group.userData.labelBaseWidth * localScale;
    const labelHeight = group.userData.labelBaseHeight * localScale;

    group.userData.label.scale.set(labelWidth, labelHeight, 1);
    group.userData.label.position.set(
      0,
      -group.userData.imageBaseHeight * 0.5
        - labelHeight * 0.58
        - (0.012 * state.poseScale) / visualScale,
      0,
    );
  });
}

function updatePoseLayerAppearance(group, image, diagramOverlay, mode) {
  const pose = group.userData.pose;
  const material = image.material;
  const brightness = {
    body: 1.35,
    bodyTransparent: 1.55,
    overlay: 1.75,
    diagram: 2.8,
  }[mode];
  const color = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country])
    : new THREE.Color(1, 1, 1);
  if (state.countryColors) {
    color.offsetHSL(
      0,
      mode === "body" || mode === "bodyTransparent" ? 0.08 : 0.24,
      mode === "diagram" ? 0.03 : 0,
    );
  }
  material.color.copy(color.multiplyScalar(brightness));
  material.blending = mode === "diagram" ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.needsUpdate = true;

  const diagramMaterial = diagramOverlay.material;
  const diagramColor = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country]).offsetHSL(0, 0.24, 0.03)
    : new THREE.Color(1, 1, 1);
  diagramMaterial.color.copy(diagramColor.multiplyScalar(2.8));
  diagramMaterial.needsUpdate = true;
}

function updatePoseAppearance(group) {
  updatePoseLayerAppearance(
    group,
    group.userData.image,
    group.userData.diagramOverlay,
    state.mode,
  );
  if (presentation.modeTransitioning && presentation.modeTransitionTarget) {
    updatePoseLayerAppearance(
      group,
      group.userData.transitionImage,
      group.userData.transitionDiagramOverlay,
      presentation.modeTransitionTarget,
    );
  }

  const pose = group.userData.pose;
  const labelColor = state.countryColors
    ? new THREE.Color(payload.countryColors[pose.country]).offsetHSL(0, 0.04, 0.22)
    : new THREE.Color(0xf2f2ed);
  group.userData.label.material.color.copy(labelColor);
  group.userData.label.material.needsUpdate = true;
  applyPoseVisualOpacity(group, group.userData.visualOpacity);
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
  poseObjects.forEach((group) => applyPoseVisualOpacity(group, group.userData.visualOpacity));
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
      const radius =
        (0.0008 + Math.pow(normalized, 1.65) * 0.026) *
        connectionRadiusScale *
        revealWeight;
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
  if (
    Array.isArray(firstPose.featureVector) &&
    Array.isArray(secondPose.featureVector) &&
    firstPose.featureVector.length === secondPose.featureVector.length
  ) {
    const squaredDistance = firstPose.featureVector.reduce((total, value, index) => {
      const difference = value - secondPose.featureVector[index];
      return total + difference * difference;
    }, 0);
    return Math.sqrt(squaredDistance);
  }
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
  group.userData.transitionImage.renderOrder = level === 2 ? 12 : level === 1 ? 11 : 2;
  group.userData.transitionImage.material.depthTest = level === 0;
  group.userData.transitionImage.material.needsUpdate = true;
  group.userData.transitionDiagramOverlay.renderOrder =
    level === 2 ? 13 : level === 1 ? 12 : 3;
  group.userData.label.renderOrder = level === 2 ? 14 : level === 1 ? 13 : 4;
}

function applyPoseLayerOpacity(image, diagramOverlay, mode, opacity) {
  image.material.opacity = image.material.map ? opacity : 0;
  diagramOverlay.material.opacity =
    mode === "bodyTransparent" && diagramOverlay.material.map
      ? opacity * state.diagramOverlayOpacity
      : 0;
}

function applyPoseVisualOpacity(group, opacity) {
  const transitionProgress = presentation.modeTransitioning
    ? group.userData.modeTransitionProgress
    : 0;
  applyPoseLayerOpacity(
    group.userData.image,
    group.userData.diagramOverlay,
    state.mode,
    opacity * (1 - transitionProgress),
  );
  applyPoseLayerOpacity(
    group.userData.transitionImage,
    group.userData.transitionDiagramOverlay,
    presentation.modeTransitionTarget,
    opacity * transitionProgress,
  );
  group.userData.label.material.opacity = state.poseLabels ? opacity * 0.86 : 0;
}

function updatePoseTransitions(deltaSeconds) {
  if (!exploration.active && !exploration.restoring && !presentation.countryTransitioning) return;
  const activeTransitionTime = presentation.countryTransitioning
    ? presentation.countryTransitionDuration
    : state.transitionTime;
  const timingScale = 1.25 / activeTransitionTime;
  const transitionSpeed = (exploration.restoring ? 6.5 : 4.6) * timingScale;
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
    applyPoseVisualOpacity(group, group.userData.visualOpacity);
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
  const tubularSegments = 52;
  relatedGroups.forEach((group, index) => {
    let curve;
    if (state.lineStyle === "straight") {
      curve = new THREE.LineCurve3(selectedPosition.clone(), group.position.clone());
    } else {
      const control = new THREE.Vector3()
        .addVectors(selectedPosition, group.position)
        .multiplyScalar(0.5);
      const radial = control.clone();
      if (radial.lengthSq() < 1e-6) radial.set(0, 1, 0);
      radial.normalize();
      const connectionLength = selectedPosition.distanceTo(group.position);
      control.addScaledVector(radial, 0.3 + connectionLength * 0.13);
      curve = new THREE.QuadraticBezierCurve3(
        selectedPosition.clone(),
        control,
        group.position.clone(),
      );
    }

    const geometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      comparisonConnectionRadius,
      6,
      false,
    );
    geometry.setDrawRange(0, 0);
    const countryColor = payload.countryColors[group.userData.pose.country];
    const material = new THREE.MeshBasicMaterial({
      color: countryColor,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Mesh(geometry, material);
    line.renderOrder = 0;
    line.frustumCulled = false;
    line.userData.indexCount = geometry.index.count;
    line.userData.animationIndex = index;
    comparisonLineRoot.add(line);
    exploration.comparisonLines.push(line);
  });
  comparisonLineRoot.visible = true;
  exploration.lineAnimationStart = performance.now() + state.transitionTime * 96;
}

function updateComparisonLineAnimation(time) {
  if (!exploration.active || exploration.comparisonLines.length === 0) return;
  const duration = state.transitionTime * 720;
  const stagger = state.transitionTime * 84;
  exploration.comparisonLines.forEach((line) => {
    const delay = line.userData.animationIndex * stagger;
    const progress = smoothstep((time - exploration.lineAnimationStart - delay) / duration);
    const visibleIndices = progress <= 0
      ? 0
      : Math.max(
          36,
          Math.floor((line.userData.indexCount * progress) / 6) * 6,
        );
    line.geometry.setDrawRange(0, visibleIndices);
    line.material.opacity = progress * 0.82;
  });
}

function startCameraTween(
  endPosition,
  endTarget,
  onComplete = null,
  duration = state.transitionTime * 1000,
) {
  controls.enabled = false;
  exploration.cameraTween = {
    startTime: performance.now(),
    duration: reducedMotion ? 80 : duration,
    startPosition: camera.position.clone(),
    endPosition: endPosition.clone(),
    startTarget: controls.target.clone(),
    endTarget: endTarget.clone(),
    lastTime: performance.now(),
    orbitAngle: 0,
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
  const elapsedSeconds = Math.max(0, time - tween.lastTime) / 1000;
  tween.lastTime = time;
  if (controls.autoRotate) {
    tween.orbitAngle -=
      elapsedSeconds * (Math.PI * 2 / 60) * controls.autoRotateSpeed;
    camera.position
      .sub(controls.target)
      .applyAxisAngle(cylinderAxis, tween.orbitAngle)
      .add(controls.target);
  }
  camera.lookAt(controls.target);
  if (progress >= 1) {
    exploration.cameraTween = null;
    if (tween.onComplete) tween.onComplete();
  }
  return true;
}

function calculateCameraFrame(groups, frontFacing = false) {
  if (groups.length === 0) {
    return {
      position: presentationHomePosition.clone(),
      target: presentationHomeTarget.clone(),
    };
  }
  const bounds = new THREE.Box3();
  groups.forEach((group) => bounds.expandByPoint(group.position));
  const target = bounds.getCenter(new THREE.Vector3());
  const radius = groups.reduce(
    (largest, group) => Math.max(largest, group.position.distanceTo(target)),
    0,
  );
  const viewDirection = frontFacing
    ? new THREE.Vector3(0, 0, 1)
    : camera.position.clone().sub(controls.target);
  if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0, 1);
  viewDirection.normalize();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * camera.aspect);
  const fitFov = Math.min(verticalFov, horizontalFov);
  const distance = THREE.MathUtils.clamp(
    Math.max(4.4, (radius / Math.tan(fitFov * 0.5)) * 1.22),
    4.4,
    58,
  );
  return {
    position: target.clone().addScaledVector(viewDirection, distance),
    target,
  };
}

function focusCameraOnGroups(groups, enableControlsAfter = exploration.active) {
  if (groups.length === 0) return;
  const frame = calculateCameraFrame(groups);
  startCameraTween(frame.position, frame.target, () => {
    controls.enabled = enableControlsAfter;
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
  updatePresentationComparisonTitle(null);
}

function setPresentationTitle(title = "", description = "") {
  const visible = presentation.active && Boolean(title);
  presentationTitleLabel.textContent = visible ? title : "";
  presentationTitleDescription.textContent = visible ? description : "";
  presentationTitle.classList.toggle("is-visible", visible);
  presentationTitle.setAttribute("aria-hidden", String(!visible));
}

function updatePresentationComparisonTitle(mode, count = 0) {
  const country = exploration.selectedGroup?.userData.pose.countryLabel || "Selected Country";
  const titleTemplate = presentation.active && mode
    ? presentationComparisonTitles[mode] || ""
    : "";
  const title = titleTemplate.replace("{country}", country);
  const description = title ? comparisonStatus(mode, count) : "";
  setPresentationTitle(title, description);
}

function formatPresentationCountryList(countryNames) {
  if (countryNames.length <= 1) return countryNames[0] || "";
  if (countryNames.length === 2) return `${countryNames[0]} and ${countryNames[1]}`;
  return `${countryNames.slice(0, -1).join(", ")}, and ${countryNames.at(-1)}`;
}

function updatePresentationCountryTitle(countries) {
  const countryNames = [...countries].map((country) => country.replaceAll("_", " "));
  if (countryNames.length === 0) {
    setPresentationTitle();
    return;
  }
  if (countryNames.length === Object.keys(payload.countryColors).length) {
    setPresentationTitle(
      "All Countries",
      "Returning to the complete regional dance pose space",
    );
    return;
  }
  const description = countryNames.length === 1
    ? `Revealing traditional dance poses from ${countryNames[0]}`
    : `Comparing traditional dance poses from ${formatPresentationCountryList(countryNames)}`;
  setPresentationTitle(countryNames.join(" + "), description);
}

function selectPose(group) {
  if (!group || opening.active) return;
  if (exploration.restoring) exploration.restoring = false;
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
      relevant ? 1 : countryVisible ? 0.1 : 0,
      selected ? 1.5 : related ? 2 : 0.92,
    );
    setPoseProminence(group, selected ? 2 : related ? 1 : 0);
  });
  lineRoot.visible = false;
  anchorRoot.visible = false;
  createComparisonLines(relatedGroups);
  exploreStatus.textContent = comparisonStatus(mode, relatedGroups.length);
  updatePresentationComparisonTitle(mode, relatedGroups.length);
  focusCameraOnGroups([exploration.selectedGroup, ...relatedGroups]);
}

function exitExploration(options = {}) {
  if (!exploration.active) return;
  const endPosition = options.cameraPosition || exploration.savedCameraPosition;
  const endTarget = options.cameraTarget || exploration.savedCameraTarget;
  const duration = options.duration ?? state.transitionTime * 1000;
  exploration.active = false;
  exploration.restoring = true;
  exploration.selectedGroup = null;
  exploration.relatedGroups = new Set();
  exploration.comparisonMode = null;
  updatePresentationComparisonTitle(null);
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
    endPosition,
    endTarget,
    () => {
      exploration.restoring = false;
      controls.enabled = true;
      controls.autoRotate = presentation.active
        ? presentation.mapRotation
        : exploration.savedAutoRotate;
      if (presentation.countryTransitioning) return;
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
    duration,
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
  const orbitElapsed = THREE.MathUtils.clamp(
    (time - opening.startTime) / 1000,
    0,
    opening.duration / 1000,
  );
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
    const rotationDelta = elapsed * radiansPerSecond * group.userData.rotationDirection;
    group.userData.image.rotation.y += rotationDelta;
    group.userData.transitionImage.rotation.y = group.userData.image.rotation.y;
  });
  lastPoseRotationTime = timeSeconds;
}

function resetPoseRotations() {
  poseObjects.forEach((group) => {
    group.userData.image.rotation.set(0, 0, 0);
    group.userData.transitionImage.rotation.set(0, 0, 0);
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
      group.userData.transitionImage.rotation.copy(group.userData.image.rotation);
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
    const visible = state.visibleCountries.has(group.userData.pose.country);
    group.visible = visible;
    if (!exploration.active && !exploration.restoring && !presentation.countryTransitioning) {
      group.userData.visualOpacity = visible ? 1 : 0;
      group.userData.targetOpacity = visible ? 1 : 0;
      applyPoseVisualOpacity(group, visible ? 1 : 0);
    }
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

function updatePoseModeControls(mode) {
  displayModeInput.value = mode;
  exploreDisplayModeInput.value = mode;
  const previousMode = state.mode;
  state.mode = mode;
  updateDiagramOverlayControls();
  state.mode = previousMode;
}

function configurePoseLayer(group, image, diagramOverlay, mode) {
  const textures = group.userData.modeTextures || {};
  image.material.map = textures[mode] || null;
  image.material.needsUpdate = true;
  diagramOverlay.material.map = mode === "bodyTransparent" ? textures.diagram || null : null;
  diagramOverlay.material.needsUpdate = true;
  updatePoseLayerScale(group, image, mode);
  updatePoseLayerAppearance(group, image, diagramOverlay, mode);
}

function clearPoseModeTransition() {
  presentation.modeTransitioning = false;
  presentation.modeTransitionTarget = null;
  poseObjects.forEach((group) => {
    const transitionImage = group.userData.transitionImage;
    const transitionDiagramOverlay = group.userData.transitionDiagramOverlay;
    transitionImage.visible = false;
    transitionImage.material.opacity = 0;
    transitionDiagramOverlay.material.opacity = 0;
    group.userData.modeTransitionDelay = 0;
    group.userData.modeTransitionStartProgress = 0;
    group.userData.modeTransitionProgress = 0;
    applyPoseVisualOpacity(group, group.userData.visualOpacity);
  });
  presentation.modeTransitionDestination = null;
}

function activatePoseMode(mode) {
  state.mode = mode;
  displayModeInput.value = mode;
  exploreDisplayModeInput.value = mode;
  updateDiagramOverlayControls();
  clearPoseModeTransition();

  poseObjects.forEach((group) => {
    configurePoseLayer(
      group,
      group.userData.image,
      group.userData.diagramOverlay,
      mode,
    );
    updatePoseScale(group);
    updatePoseAppearance(group);
  });
}

async function preloadPoseTextures() {
  embeddingVersionInput.disabled = true;
  const modes = ["body", "bodyTransparent", "overlay", "diagram"];
  const totalTextures = poseObjects.length * modes.length;
  setLoading("Preloading all display styles…", 0);

  let cursor = 0;
  let completedTextures = 0;
  const workerCount = 12;

  async function worker() {
    while (cursor < poseObjects.length) {
      const index = cursor++;
      const group = poseObjects[index];
      const pose = group.userData.pose;
      const results = await Promise.allSettled(
        modes.map((mode) => loadTexture(pose.assets[mode], mode)),
      );
      group.userData.modeTextures = {};
      results.forEach((result, modeIndex) => {
        const mode = modes[modeIndex];
        if (result.status === "fulfilled") {
          group.userData.modeTextures[mode] = result.value;
          preloadedTextures.push(result.value);
        } else {
          console.error(`Could not preload ${pose.id} (${mode})`, result.reason);
        }
        completedTextures += 1;
      });
      if (completedTextures % 48 === 0 || completedTextures === totalTextures) {
        setLoading(
          "Preloading all display styles…",
          Math.round((completedTextures / totalTextures) * 100),
        );
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  activatePoseMode(state.mode);
  hideLoading();
  embeddingVersionInput.disabled = false;
}

async function loadPoseMode(mode) {
  if (mode === state.mode) return;
  activatePoseMode(mode);
}

async function transitionPresentationPoseMode(mode) {
  if (mode === state.mode && !presentation.modeTransitioning) return;
  if (!presentation.active || reducedMotion) {
    presentation.modeTransitionGeneration += 1;
    activatePoseMode(mode);
    return;
  }

  const existingTarget = presentation.modeTransitionTarget;
  if (presentation.modeTransitioning && mode === presentation.modeTransitionDestination) return;

  const generation = ++presentation.modeTransitionGeneration;
  const reversing = presentation.modeTransitioning && mode === state.mode;
  if (presentation.modeTransitioning && !reversing) {
    const averageProgress = poseObjects.reduce(
      (total, group) => total + group.userData.modeTransitionProgress,
      0,
    ) / Math.max(poseObjects.length, 1);
    activatePoseMode(averageProgress >= 0.5 ? existingTarget : state.mode);
    if (mode === state.mode) {
      updatePoseModeControls(mode);
      return;
    }
  }

  presentation.modeTransitioning = true;
  presentation.modeTransitionTarget = reversing ? existingTarget : mode;
  presentation.modeTransitionDestination = mode;
  updatePoseModeControls(mode);

  const screenDistances = poseObjects.map((group) => {
    group.getWorldPosition(poseTransitionWorldPosition);
    poseTransitionWorldPosition.project(camera);
    return Math.hypot(poseTransitionWorldPosition.x, poseTransitionWorldPosition.y);
  });
  const minimumScreenDistance = Math.min(...screenDistances);
  const maximumScreenDistance = Math.max(...screenDistances);
  const screenDistanceRange = Math.max(maximumScreenDistance - minimumScreenDistance, 0.0001);

  poseObjects.forEach((group, index) => {
    group.userData.modeTransitionDelay =
      ((screenDistances[index] - minimumScreenDistance) / screenDistanceRange) *
      poseModeMaximumStagger;
    group.userData.modeTransitionStartProgress = reversing
      ? group.userData.modeTransitionProgress
      : 0;
    if (!reversing) {
      group.userData.modeTransitionProgress = 0;
      configurePoseLayer(
        group,
        group.userData.transitionImage,
        group.userData.transitionDiagramOverlay,
        mode,
      );
    }
    group.userData.transitionImage.visible = group.visible;
    applyPoseVisualOpacity(group, group.userData.visualOpacity);
  });

  const completed = await new Promise((resolve) => {
    const startTime = performance.now();
    function updateCrossfade(time) {
      if (generation !== presentation.modeTransitionGeneration) {
        resolve(false);
        return;
      }
      const elapsed = time - startTime;
      let transitionComplete = true;
      poseObjects.forEach((group) => {
        const localProgress = clamp01(
          (elapsed - group.userData.modeTransitionDelay) / poseModeFadeDuration,
        );
        group.userData.modeTransitionProgress = THREE.MathUtils.lerp(
          group.userData.modeTransitionStartProgress,
          reversing ? 0 : 1,
          easeInOutCubic(localProgress),
        );
        if (localProgress < 1) transitionComplete = false;
        group.userData.transitionImage.visible = group.visible;
        applyPoseVisualOpacity(group, group.userData.visualOpacity);
      });
      if (!transitionComplete) {
        window.requestAnimationFrame(updateCrossfade);
      } else {
        resolve(true);
      }
    }
    window.requestAnimationFrame(updateCrossfade);
  });

  if (completed && generation === presentation.modeTransitionGeneration) {
    activatePoseMode(mode);
  }
}

function changePoseMode(mode) {
  return presentation.active
    ? transitionPresentationPoseMode(mode)
    : loadPoseMode(mode);
}

function normalizePresentationToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parsePresentationCommand(source) {
  const nameMatch = source.match(/^([a-z ]+?)(?=[\[\{(]|$)/i);
  const name = normalizePresentationToken(nameMatch?.[1] || source);
  const argumentsList = [];
  const argumentPattern = /\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\)/g;
  let match;
  while ((match = argumentPattern.exec(source))) {
    argumentsList.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return { name, arguments: argumentsList, source };
}

function parsePresentationOutline(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">>"))
    .map((line, index) => {
      const source = line.slice(2).split("//", 1)[0].trim();
      return {
        index,
        source,
        commands: source
          .split("/")
          .map((command) => command.trim())
          .filter(Boolean)
          .map(parsePresentationCommand),
      };
    });
}

function resolvePresentationView(value) {
  const views = {
    bodytransparent: "bodyTransparent",
    transparentbody: "bodyTransparent",
    diagramonly: "diagram",
    diagram: "diagram",
    bodyonly: "body",
    body: "body",
    image: "body",
    bodywithdiagram: "overlay",
    imagewithdiagram: "overlay",
    overlay: "overlay",
  };
  return views[normalizePresentationToken(value)] || null;
}

function resolvePresentationComparison(value) {
  const comparisons = {
    similar: "similar",
    different: "different",
    mostdifferent: "different",
    similarallcountries: "similar-all-countries",
    differentallcountries: "different-all-countries",
    mostdifferentallcountries: "different-all-countries",
    similarsamecountry: "similar-same-country",
    similarsamecountries: "similar-same-country",
    differentsamecountry: "different-same-country",
    differentsamecountries: "different-same-country",
    mostdifferentsamecountry: "different-same-country",
    mostdifferentsamecountries: "different-same-country",
  };
  return comparisons[normalizePresentationToken(value)] || null;
}

function resolvePresentationCountry(value) {
  const key = normalizePresentationToken(value);
  if (key === "all" || key === "allcountries") return "all";
  const aliases = {
    brunei: "Brunei_Darussalam",
    bruneidarussalam: "Brunei_Darussalam",
    phllipines: "Philippines",
  };
  if (aliases[key] && payload.countryColors[aliases[key]]) return aliases[key];
  return Object.keys(payload.countryColors).find(
    (country) => normalizePresentationToken(country) === key,
  ) || null;
}

function parsePresentationPose(value) {
  const match = String(value).trim().match(/^(.+?)\s*\((\d+)\)$/);
  if (!match) return null;
  const country = resolvePresentationCountry(match[1]);
  if (!country || country === "all") return null;
  return {
    country,
    number: match[2].padStart(2, "0"),
  };
}

function findPresentationPoseGroup(poseReference) {
  if (!poseReference) return null;
  return poseObjects.find(
    (group) =>
      group.userData.pose.country === poseReference.country &&
      String(group.userData.pose.number).padStart(2, "0") === poseReference.number,
  ) || null;
}

function compilePresentationState(slideIndex) {
  const allCountries = Object.keys(payload.countryColors);
  const target = {
    mode: "bodyTransparent",
    diagramOverlay: 0,
    poseRotation: false,
    poseRotationSpeed: Number(rotationSpeedInput.value),
    mapRotation: false,
    mapRotationSpeed: controls.autoRotateSpeed,
    visibleCountries: new Set(allCountries),
    selectedPose: null,
    comparisonMode: null,
  };

  for (let index = 0; index <= slideIndex; index += 1) {
    presentation.slides[index].commands.forEach((command) => {
      const firstArgument = command.arguments[0];
      if (command.name === "view") {
        target.mode = resolvePresentationView(firstArgument) || target.mode;
      } else if (command.name === "diagramoverlay") {
        target.diagramOverlay = THREE.MathUtils.clamp(Number(firstArgument), 0, 100);
      } else if (command.name === "verticalrotation") {
        target.poseRotation = Number(firstArgument) > 0;
      } else if (command.name === "verticalrotationspeed") {
        target.poseRotationSpeed = THREE.MathUtils.clamp(Number(firstArgument), 0.5, 720);
      } else if (command.name === "maprotation" || command.name === "camerarotation") {
        target.mapRotation = Number(firstArgument) > 0;
      } else if (
        command.name === "maprotationspeed" ||
        command.name === "camerarotationspeed"
      ) {
        target.mapRotationSpeed = THREE.MathUtils.clamp(Number(firstArgument), 0.1, 20);
      } else if (command.name === "goto") {
        const poseReference = parsePresentationPose(firstArgument);
        if (poseReference) {
          target.selectedPose = poseReference;
          target.comparisonMode = null;
        }
      } else if (command.name === "activate") {
        target.comparisonMode =
          resolvePresentationComparison(firstArgument) || target.comparisonMode;
      } else if (command.name === "gotohome") {
        target.selectedPose = null;
        target.comparisonMode = null;
      } else if (command.name === "hide") {
        const country = resolvePresentationCountry(firstArgument);
        if (country === "all") target.visibleCountries.clear();
        else if (country) target.visibleCountries.delete(country);
      } else if (command.name === "show") {
        const country = resolvePresentationCountry(firstArgument);
        if (country === "all") allCountries.forEach((name) => target.visibleCountries.add(name));
        else if (country) target.visibleCountries.add(country);
      }
    });
  }

  const currentCommands = presentation.slides[slideIndex].commands;
  const zoomCommand = currentCommands.find((command) => command.name === "zoominto");
  const durationCommand = currentCommands.find(
    (command) => command.name === "duration" || command.name === "transitionduration",
  );
  const showCommands = currentCommands.filter((command) => command.name === "show");
  return {
    target,
    effects: {
      blackout: currentCommands.some((command) => command.name === "blackscreen"),
      opening: currentCommands.some((command) => command.name === "opening"),
      goHome: currentCommands.some((command) => command.name === "gotohome"),
      poseRotationChanged: currentCommands.some(
        (command) => command.name === "verticalrotation",
      ),
      transitionDuration: durationCommand
        ? THREE.MathUtils.clamp(Number(durationCommand.arguments[0]), 0.1, 30) * 1000
        : state.transitionTime * 1000,
      countryVisibilityChanged: currentCommands.some(
        (command) => command.name === "show" || command.name === "hide",
      ),
      showCountries: showCommands.flatMap((command) =>
        command.arguments.map(resolvePresentationCountry).filter(Boolean)),
      zoomCountries: zoomCommand
        ? zoomCommand.arguments.map(resolvePresentationCountry).filter((country) => country && country !== "all")
        : [],
    },
  };
}

async function setPresentationCountryVisibility(
  countries,
  animate = presentation.active,
  duration = state.transitionTime * 1000,
) {
  const sameTarget =
    countries.size === state.visibleCountries.size &&
    [...countries].every((country) => state.visibleCountries.has(country));
  if (!animate && sameTarget) return;

  const generation = ++presentation.countryTransitionGeneration;
  state.visibleCountries.clear();
  countries.forEach((country) => state.visibleCountries.add(country));
  countryInputs.forEach((input, country) => {
    input.checked = state.visibleCountries.has(country);
  });
  const allVisible = state.visibleCountries.size === Object.keys(payload.countryColors).length;
  toggleCountriesButton.textContent = allVisible ? "Hide all" : "Show all";
  const visibilityChanged = poseObjects.some((group) => {
    const targetOpacity = state.visibleCountries.has(group.userData.pose.country) ? 1 : 0;
    return Math.abs(group.userData.targetOpacity - targetOpacity) > 0.001;
  });

  if (!animate || reducedMotion || !visibilityChanged || exploration.active) {
    if (generation === presentation.countryTransitionGeneration) {
      presentation.countryTransitioning = false;
    }
    updateCountryVisibility();
    return;
  }

  presentation.countryTransitioning = true;
  presentation.countryTransitionDuration = duration / 1000;
  poseObjects.forEach((group) => {
    const country = group.userData.pose.country;
    const targetVisible = state.visibleCountries.has(country);
    if (targetVisible && !group.visible) {
      group.visible = true;
      applyPoseVisualOpacity(group, group.userData.visualOpacity);
    }
    setPoseTarget(group, targetVisible ? 1 : 0, 1);
    setPoseProminence(group, 0);
  });
  updateConnections();

  await waitForPresentationTransition(duration);
  if (generation !== presentation.countryTransitionGeneration) return;
  poseObjects.forEach((group) => {
    const targetVisible = state.visibleCountries.has(group.userData.pose.country);
    group.userData.visualOpacity = targetVisible ? 1 : 0;
    group.userData.targetOpacity = targetVisible ? 1 : 0;
    group.userData.visualScale = 1;
    group.userData.targetScale = 1;
    group.scale.setScalar(1);
    group.visible = targetVisible;
    applyPoseVisualOpacity(group, targetVisible ? 1 : 0);
  });
  presentation.countryTransitioning = false;
  updateConnections();
}

function waitForPresentationTransition(milliseconds = state.transitionTime * 1000) {
  if (reducedMotion) return new Promise((resolve) => window.setTimeout(resolve, 100));
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function goToPresentationHome() {
  const frame = {
    position: presentationHomePosition.clone(),
    target: presentationHomeTarget.clone(),
  };
  if (exploration.active) {
    exitExploration({
      cameraPosition: frame.position,
      cameraTarget: frame.target,
      duration: state.transitionTime * 1000,
    });
    return waitForPresentationTransition();
  }
  startCameraTween(
    frame.position,
    frame.target,
    () => {
      controls.enabled = true;
    },
    state.transitionTime * 1000,
  );
  return waitForPresentationTransition();
}

async function applyPresentationSlide(slideIndex) {
  const { target, effects } = compilePresentationState(slideIndex);
  document.body.classList.toggle("presentation-blackout-active", effects.blackout);
  presentationBlackout.setAttribute("aria-hidden", String(!effects.blackout));

  if (opening.active && !effects.opening) finishOpeningScene();
  if (effects.goHome || (!target.comparisonMode && effects.showCountries.length === 0)) {
    setPresentationTitle();
  }

  const transitionTasks = [];
  if (target.mode !== state.mode || presentation.modeTransitioning) {
    transitionTasks.push(changePoseMode(target.mode));
  }
  setDiagramOverlayOpacity(target.diagramOverlay);
  state.poseRotationSpeed = target.poseRotationSpeed;
  rotationSpeedInput.value = String(target.poseRotationSpeed);
  rotationSpeedValue.value = `${target.poseRotationSpeed.toFixed(1).replace(".0", "")}°/s`;
  transitionTasks.push(
    setPresentationCountryVisibility(
      target.visibleCountries,
      effects.countryVisibilityChanged,
      effects.transitionDuration,
    ),
  );

  if (effects.showCountries.length > 0 && !effects.goHome) {
    updatePresentationCountryTitle(target.visibleCountries);
  }

  if (target.selectedPose) {
    transitionTasks.push((async () => {
      const poseGroup = findPresentationPoseGroup(target.selectedPose);
      if (!poseGroup) {
        throw new Error(
          `Presentation pose not found: ${target.selectedPose.country} ${target.selectedPose.number}`,
        );
      }
      selectPose(poseGroup);
      if (target.comparisonMode) applyComparison(target.comparisonMode);
    })());
  } else if (exploration.active) {
    if (effects.goHome) transitionTasks.push(goToPresentationHome());
    else {
      exitExploration();
      transitionTasks.push(waitForPresentationTransition());
    }
  } else if (effects.goHome) {
    transitionTasks.push(goToPresentationHome());
  }

  if (effects.opening) {
    if (exploration.active) exitExploration();
    startOpeningScene();
  }
  setPoseRotationEnabled(
    target.poseRotation,
    effects.poseRotationChanged && target.poseRotation && !state.poseRotation,
  );
  presentation.mapRotation = target.mapRotation && !reducedMotion;
  controls.autoRotateSpeed = target.mapRotationSpeed;
  controls.autoRotate = presentation.mapRotation;
  autoRotateInput.checked = controls.autoRotate;

  if (effects.zoomCountries.length > 0) {
    const zoomGroups = poseObjects.filter(
      (group) =>
        effects.zoomCountries.includes(group.userData.pose.country) &&
        target.visibleCountries.has(group.userData.pose.country),
    );
    focusCameraOnGroups(zoomGroups, true);
    transitionTasks.push(waitForPresentationTransition());
  }

  await Promise.all(transitionTasks);
}

function updatePresentationButton() {
  presentationButton.setAttribute("aria-pressed", String(presentation.active));
  presentationButtonLabel.textContent = presentation.active
    ? `Exit presentation · ${presentation.index + 1}/${presentation.slides.length}`
    : "Presentation mode";
}

async function navigatePresentation(slideIndex) {
  if (!presentation.active || presentation.slides.length === 0) return;
  const boundedIndex = THREE.MathUtils.clamp(
    slideIndex,
    0,
    presentation.slides.length - 1,
  );
  if (boundedIndex === presentation.index) return;
  const generation = ++presentation.navigationGeneration;
  presentation.busy = true;
  presentation.index = boundedIndex;
  document.body.dataset.presentationStep = String(boundedIndex + 1);
  updatePresentationButton();
  try {
    await applyPresentationSlide(boundedIndex);
  } catch (error) {
    console.error(error);
    presentationButtonLabel.textContent = `Presentation error · ${boundedIndex + 1}`;
  } finally {
    if (generation === presentation.navigationGeneration) presentation.busy = false;
  }
}

function stepPresentation(direction) {
  navigatePresentation(presentation.index + direction);
}

async function enterPresentationMode() {
  if (presentation.active || presentation.slides.length === 0) return;
  presentation.active = true;
  presentation.navigationGeneration += 1;
  presentation.savedAutoRotate = controls.autoRotate;
  presentation.index = -1;
  presentation.fullscreenRequested = true;
  document.body.classList.add("presentation-active");
  updatePresentationComparisonTitle(null);
  openSettings(false);
  updatePresentationButton();

  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch((error) => {
      console.warn("Fullscreen presentation was not available", error);
    });
  }
  await navigatePresentation(0);
}

async function exitPresentationMode(exitFullscreen = true) {
  if (!presentation.active) return;
  presentation.active = false;
  presentation.busy = false;
  presentation.navigationGeneration += 1;
  presentation.countryTransitionGeneration += 1;
  presentation.mapRotation = false;
  controls.autoRotate = presentation.savedAutoRotate;
  autoRotateInput.checked = controls.autoRotate;
  presentation.index = -1;
  presentation.fullscreenRequested = false;
  document.body.classList.remove("presentation-active", "presentation-blackout-active");
  document.body.removeAttribute("data-presentation-step");
  presentationBlackout.setAttribute("aria-hidden", "true");
  presentation.modeTransitionGeneration += 1;
  clearPoseModeTransition();
  displayModeInput.value = state.mode;
  exploreDisplayModeInput.value = state.mode;
  updateDiagramOverlayControls();
  presentation.countryTransitioning = false;
  updatePresentationComparisonTitle(null);
  updatePresentationButton();
  if (exitFullscreen && document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen().catch(() => {});
  }
}

function isPresentationKeyboardTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
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
  presentationButton.addEventListener("click", () => {
    if (presentation.active) exitPresentationMode();
    else enterPresentationMode();
  });
  settingsButton.addEventListener("click", () => openSettings(true));
  closeSettingsButton.addEventListener("click", () => openSettings(false));
  randomPoseButton.addEventListener("click", selectRandomPose);
  closeExploreButton.addEventListener("click", exitExploration);
  comparisonButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyComparison(button.dataset.comparison));
  });
  window.addEventListener("keydown", (event) => {
    if (presentation.active && !isPresentationKeyboardTarget(event.target)) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepPresentation(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPresentation(-1);
        return;
      }
      if (event.key === "Escape") {
        exitPresentationMode();
        return;
      }
    }
    if (event.key !== "Escape") return;
    if (exploration.active) exitExploration();
    else openSettings(false);
  });
  document.addEventListener("fullscreenchange", () => {
    if (
      presentation.active &&
      presentation.fullscreenRequested &&
      !document.fullscreenElement
    ) {
      exitPresentationMode(false);
    }
  });

  displayModeInput.addEventListener("change", () => changePoseMode(displayModeInput.value));
  embeddingVersionInput.addEventListener("change", () => {
    switchEmbeddingVersion(embeddingVersionInput.value);
  });
  exploreDisplayModeInput.addEventListener("change", () =>
    changePoseMode(exploreDisplayModeInput.value),
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
  transitionTimeInput.addEventListener("input", () => {
    state.transitionTime = Number(transitionTimeInput.value);
    const formattedTime = state.transitionTime
      .toFixed(2)
      .replace(/0+$/, "")
      .replace(/\.$/, "");
    transitionTimeValue.value = `${formattedTime} s`;
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
    if (exploration.active && exploration.relatedGroups.size > 0) {
      createComparisonLines([...exploration.relatedGroups]);
    }
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
    embeddingVersionInput.disabled = true;
    setLoading("Loading V1 embedding…");
    payload = await fetchEmbedding("v1");
    state.embeddingVersion = "v1";
    embeddingVersionInput.value = "v1";
    document.body.dataset.embeddingVersion = "v1";
    presentation.slides = parsePresentationOutline(presentationOutlineMarkdown);
    if (presentation.slides.length === 0) {
      throw new Error("presentation_outline.md contains no presentation steps");
    }

    buildSettings();
    payload.poses.forEach(createPoseObject);
    payload.dimensions.forEach(createAnchorObject);
    payload.dimensions.forEach(createLineMesh);
    updateSpatialLayout();
    updateCountryColors();
    bindEvents();
    updateDiagramOverlayControls();
    setDiagramOverlayOpacity(diagramOverlayInput.value);
    await preloadPoseTextures();
    poseObjects.forEach((group) => {
      group.userData.label.material.opacity = state.poseLabels ? 0.86 : 0;
    });
    playOpeningButton.disabled = false;
    randomPoseButton.disabled = false;
    presentationButton.disabled = false;
    updatePresentationButton();
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
  updateAdaptivePoseLabels();
  updatePoseRotations(now / 1000);
  renderer.render(scene, camera);
});

initialize();
