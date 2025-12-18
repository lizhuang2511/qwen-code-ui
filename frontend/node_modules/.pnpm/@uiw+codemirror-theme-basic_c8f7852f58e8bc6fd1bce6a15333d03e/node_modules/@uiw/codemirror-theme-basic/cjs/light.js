"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault")["default"];
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defaultSettingsBasicLight = exports.basicLightStyle = exports.basicLightInit = exports.basicLight = void 0;
var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));
var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread2"));
var _highlight = require("@lezer/highlight");
var _codemirrorThemes = require("@uiw/codemirror-themes");
var defaultSettingsBasicLight = exports.defaultSettingsBasicLight = {
  background: '#ffffff',
  foreground: '#2e3440',
  caret: '#3b4252',
  selection: '#eceff4',
  selectionMatch: '#e5e9f0',
  gutterBackground: '#eceff4',
  gutterForeground: '#2e3440',
  gutterBorder: 'none',
  lineHighlight: '#02255f11'
};
var basicLightStyle = exports.basicLightStyle = [{
  tag: _highlight.tags.keyword,
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.name, _highlight.tags.deleted, _highlight.tags.character, _highlight.tags.propertyName, _highlight.tags.macroName],
  color: '#d08770'
}, {
  tag: [_highlight.tags.variableName],
  color: '#d08770'
}, {
  tag: [_highlight.tags["function"](_highlight.tags.variableName)],
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.labelName],
  color: '#81a1c1'
}, {
  tag: [_highlight.tags.color, _highlight.tags.constant(_highlight.tags.name), _highlight.tags.standard(_highlight.tags.name)],
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.definition(_highlight.tags.name), _highlight.tags.separator],
  color: '#a3be8c'
}, {
  tag: [_highlight.tags.brace],
  color: '#8fbcbb'
}, {
  tag: [_highlight.tags.annotation],
  color: '#d30102'
}, {
  tag: [_highlight.tags.number, _highlight.tags.changed, _highlight.tags.annotation, _highlight.tags.modifier, _highlight.tags.self, _highlight.tags.namespace],
  color: '#88c0d0'
}, {
  tag: [_highlight.tags.typeName, _highlight.tags.className],
  color: '#ebcb8b'
}, {
  tag: [_highlight.tags.operator, _highlight.tags.operatorKeyword],
  color: '#a3be8c'
}, {
  tag: [_highlight.tags.tagName],
  color: '#b48ead'
}, {
  tag: [_highlight.tags.squareBracket],
  color: '#bf616a'
}, {
  tag: [_highlight.tags.angleBracket],
  color: '#d08770'
}, {
  tag: [_highlight.tags.attributeName],
  color: '#ebcb8b'
}, {
  tag: [_highlight.tags.regexp],
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.quote],
  color: '#3b4252'
}, {
  tag: [_highlight.tags.string],
  color: '#d08770'
}, {
  tag: _highlight.tags.link,
  color: '#8fbcbb',
  textDecoration: 'underline',
  textUnderlinePosition: 'under'
}, {
  tag: [_highlight.tags.url, _highlight.tags.escape, _highlight.tags.special(_highlight.tags.string)],
  color: '#d08770'
}, {
  tag: [_highlight.tags.meta],
  color: '#88c0d0'
}, {
  tag: [_highlight.tags.comment],
  color: '#434c5e',
  fontStyle: 'italic'
}, {
  tag: _highlight.tags.strong,
  fontWeight: 'bold',
  color: '#5e81ac'
}, {
  tag: _highlight.tags.emphasis,
  fontStyle: 'italic',
  color: '#5e81ac'
}, {
  tag: _highlight.tags.strikethrough,
  textDecoration: 'line-through'
}, {
  tag: _highlight.tags.heading,
  fontWeight: 'bold',
  color: '#5e81ac'
}, {
  tag: _highlight.tags.special(_highlight.tags.heading1),
  fontWeight: 'bold',
  color: '#5e81ac'
}, {
  tag: _highlight.tags.heading1,
  fontWeight: 'bold',
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.heading2, _highlight.tags.heading3, _highlight.tags.heading4],
  fontWeight: 'bold',
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.heading5, _highlight.tags.heading6],
  color: '#5e81ac'
}, {
  tag: [_highlight.tags.atom, _highlight.tags.bool, _highlight.tags.special(_highlight.tags.variableName)],
  color: '#d08770'
}, {
  tag: [_highlight.tags.processingInstruction, _highlight.tags.inserted],
  color: '#8fbcbb'
}, {
  tag: [_highlight.tags.contentSeparator],
  color: '#ebcb8b'
}, {
  tag: _highlight.tags.invalid,
  color: '#434c5e',
  borderBottom: '1px dotted #d30102'
}];
var basicLightInit = exports.basicLightInit = function basicLightInit(options) {
  var _ref = options || {},
    _ref$theme = _ref.theme,
    theme = _ref$theme === void 0 ? 'light' : _ref$theme,
    _ref$settings = _ref.settings,
    settings = _ref$settings === void 0 ? {} : _ref$settings,
    _ref$styles = _ref.styles,
    styles = _ref$styles === void 0 ? [] : _ref$styles;
  return (0, _codemirrorThemes.createTheme)({
    theme: theme,
    settings: (0, _objectSpread2["default"])((0, _objectSpread2["default"])({}, defaultSettingsBasicLight), settings),
    styles: [].concat(basicLightStyle, (0, _toConsumableArray2["default"])(styles))
  });
};
var basicLight = exports.basicLight = basicLightInit();