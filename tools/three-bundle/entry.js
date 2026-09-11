// The one-time bundle behind vendor/three.js (item 1273): the whole three.js
// namespace plus the glTF loader and the skeleton utilities, as window.THREE.
import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const THREE = Object.assign({}, THREE_NS, { GLTFLoader: GLTFLoader, SkeletonUtils: SkeletonUtils });
export default THREE;
