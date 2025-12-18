"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault")["default"];
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defaultSettingsBasicDark = exports.basicDarkStyle = exports.basicDarkInit = exports.basicDark = void 0;
var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));
var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread2"));
var _highlight = require("@lezer/highlight");
var _codemirrorThemes = require("@uiw/codemirror-themes");
var defaultSettingsBasicDark = exports.defaultSettingsBasicDark = {
  background: '#2E3235',
  foreground: '#DDDDDD',
  caret: '#DDDDDD',
  selection: '#202325',
  selectionMatch: '#202325',
  gutterBackground: '#292d30',
  gutterForeground: '#808080',
  gutterBorder: '1px solid #ffffff10',
  lineHighlight: '#B9D2FF30'
};
var basicDarkStyle = exports.basicDarkStyle = [{
  tag: _highlight.tags.keyword,
  color: '#fda331'
}, {
  tag: [_highlight.tags.name, _highlight.tags.deleted, _highlight.tags.character, _highlight.tags.propertyName, _highlight.tags.macroName],
  color: '#b5bd68'
}, {
  tag: [_highlight.tags.variableName],
  color: '#6fb3d2'
}, {
  tag: [_highlight.tags["function"](_highlight.tags.variableName)],
  color: '#fda331'
}, {
  tag: [_highlight.tags.labelName],
  color: '#fc6d24'
}, {
  tag: [_highlight.tags.color, _highlight.tags.constant(_highlight.tags.name), _highlight.tags.standard(_highlight.tags.name)],
  color: '#fda331'
}, {
  tag: [_highlight.tags.definition(_highlight.tags.name), _highlight.tags.separator],
  color: '#cc99cc'
}, {
  tag: [_highlight.tags.brace],
  color: '#cc99cc'
}, {
  tag: [_highlight.tags.annotation],
  color: '#fc6d24'
}, {
  tag: [_highlight.tags.number, _highlight.tags.changed, _highlight.tags.annotation, _highlight.tags.modifier, _highlight.tags.self, _highlight.tags.namespace],
  color: '#fda331'
}, {
  tag: [_highlight.tags.typeName, _highlight.tags.className],
  color: '#6fb3d2'
}, {
  tag: [_highlight.tags.operator, _highlight.tags.operatorKeyword],
  color: '#cc99cc'
}, {
  tag: [_highlight.tags.tagName],
  color: '#fda331'
}, {
  tag: [_highlight.tags.squareBracket],
  color: '#cc99cc'
}, {
  tag: [_highlight.tags.angleBracket],
  color: '#cc99cc'
}, {
  tag: [_highlight.tags.attributeName],
  color: '#6fb3d2'
}, {
  tag: [_highlight.tags.regexp],
  color: '#fda331'
}, {
  tag: [_highlight.tags.quote],
  color: '#DDDDDD'
}, {
  tag: [_highlight.tags.string],
  color: '#b5bd68'
}, {
  tag: _highlight.tags.link,
  color: '#6987AF',
  textDecoration: 'underline',
  textUnderlinePosition: 'under'
}, {
  tag: [_highlight.tags.url, _highlight.tags.escape, _highlight.tags.special(_highlight.tags.string)],
  color: '#8abeb7'
}, {
  tag: [_highlight.tags.meta],
  color: '#A54543'
}, {
  tag: [_highlight.tags.comment],
  color: '#808080',
  fontStyle: 'italic'
}, {
  tag: _highlight.tags.monospace,
  color: '#DDDDDD'
}, {
  tag: _highlight.tags.strong,
  fontWeight: 'bold',
  color: '#fda331'
}, {
  tag: _highlight.tags.emphasis,
  fontStyle: 'italic',
  color: '#6fb3d2'
}, {
  tag: _highlight.tags.strikethrough,
  textDecoration: 'line-through'
}, {
  tag: _highlight.tags.heading,
  fontWeight: 'bold',
  color: '#DDDDDD'
}, {
  tag: _highlight.tags.special(_highlight.tags.heading1),
  fontWeight: 'bold',
  color: '#DDDDDD'
}, {
  tag: _highlight.tags.heading1,
  fontWeight: 'bold',
  color: '#DDDDDD'
}, {
  tag: [_highlight.tags.heading2, _highlight.tags.heading3, _highlight.tags.heading4],
  fontWeight: 'bold',
  color: '#DDDDDD'
}, {
  tag: [_highlight.tags.heading5, _highlight.tags.heading6],
  color: '#DDDDDD'
}, {
  tag: [_highlight.tags.atom, _highlight.tags.bool, _highlight.tags.special(_highlight.tags.variableName)],
  color: '#8abeb7'
}, {
  tag: [_highlight.tags.processingInstruction, _highlight.tags.inserted],
  color: '#8abeb7'
}, {
  tag: [_highlight.tags.contentSeparator],
  color: '#6fb3d2'
}, {
  tag: _highlight.tags.invalid,
  color: '#B9D2FF',
  borderBottom: "1px dotted ".concat('#fc6d24')
}];
var basicDarkInit = exports.basicDarkInit = function basicDarkInit(options) {
  var _ref = options || {},
    _ref$theme = _ref.theme,
    theme = _ref$theme === void 0 ? 'dark' : _ref$theme,
    _ref$settings = _ref.settings,
    settings = _ref$settings === void 0 ? {} : _ref$settings,
    _ref$styles = _ref.styles,
    styles = _ref$styles === void 0 ? [] : _ref$styles;
  return (0, _codemirrorThemes.createTheme)({
    theme: theme,
    settings: (0, _objectSpread2["default"])((0, _objectSpread2["default"])({}, defaultSettingsBasicDark), settings),
    styles: [].concat(basicDarkStyle, (0, _toConsumableArray2["default"])(styles))
  });
};
var basicDark = exports.basicDark = basicDarkInit();