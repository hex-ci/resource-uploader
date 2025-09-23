module.exports = {
  "parser": "@babel/eslint-parser",
  "parserOptions": {
    "ecmaVersion": 2018,
    "sourceType": "module",
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false
    }
  },
  "env": {
    "node": true,
    "es6": true,
    "jasmine": true,
    "atomtest": true
  },
  "extends": "eslint:recommended",
  "rules": {
    "indent": ["warn", 2, {"SwitchCase": 1}],
    "no-console": "off",
    "brace-style": [1, "stroustrup", {"allowSingleLine": true}],
    "comma-style": [1, "last"],
    "default-case": 2,
    "no-floating-decimal": 2,
    "space-before-function-paren": [1, "never"],
    "keyword-spacing": [2, {"after": true}],
    "space-before-blocks": 1,
    "wrap-iife": [2, "any"],
    "no-alert": 2,
    "curly": [2, "all"],
    "no-empty": [2, {"allowEmptyCatch": true}],
    "no-obj-calls": 2,
    "no-unused-vars": [1, {"vars": "local", "args": "after-used"}],
    "no-invalid-regexp": 2,
    "comma-dangle": [1, "never"],
    "no-undef": 2,
    "no-new": 2,
    "no-extra-semi": 0,
    "no-debugger": 2,
    "no-caller": 1,
    "no-unreachable": 2,
    "no-multi-str": 1,
    "no-mixed-spaces-and-tabs": 1,
    "no-trailing-spaces": 1,
    "space-infix-ops": 1,
    "no-with": 2,
    "dot-notation": 1,
    "semi-spacing": 1,
    "key-spacing": [1, {"beforeColon": false, "afterColon": true, "mode": "minimum"}],
    "space-in-parens": [1, "never"],
    "prefer-const": 2,
    "no-control-regex": 0
  }
}
