"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pregnancyProtocol = exports.ncdProtocol = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./validation"), exports);
__exportStar(require("./utils"), exports);
__exportStar(require("./engine"), exports);
__exportStar(require("./nlp/numberNormalizer"), exports);
__exportStar(require("./nlp/multilingualExtractor"), exports);
const ncd_demo_json_1 = __importDefault(require("./protocols/ncd-demo.json"));
exports.ncdProtocol = ncd_demo_json_1.default;
const pregnancy_demo_json_1 = __importDefault(require("./protocols/pregnancy-demo.json"));
exports.pregnancyProtocol = pregnancy_demo_json_1.default;
