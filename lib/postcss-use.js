import path from 'path';
import postcss from 'postcss';
import resolveFrom from 'resolve-from';

const useParamsRegExp = /^([^(\s]+)(?:\s*\(\s*([\W\w]+)\s*\))?/;
const optionRegExp = /^\s*([\W\w]+?)\s*:\s*([\W\w]+)\s*$/;

const pluginPostcssUse = opts => {
  // options
  const {
    modules = [],
    options = {},
    resolveFromFile = false,
    ruleName = 'use'
  } = Object(opts);

  return {
    postcssPlugin: 'postcss-use',
    Once(root, {result, list}) {
      const plugins = [];

      // walk @use rules
      root.walkAtRules(ruleName, rule => {
        // match plugin and plugin params
        const paramsMatch = rule.params.match(useParamsRegExp);

        if (paramsMatch) {
          const [, pluginName, pluginParams = ''] = paramsMatch;

          // whether the plugin is whitelisted
          const isAllowablePlugin = [].concat(modules).some(
            mod => typeof mod === 'string'
              ? mod === '*' || mod === pluginName
              : pluginName.match(mod)
          );

          if (isAllowablePlugin) {
            // plugin options
            const defaultOpts = Object(options)[pluginName];
            const paramOpts = getOptionsFromParams(pluginParams, list);
            const childOpts = getOptionsFromRuleChildren(rule);

            const pluginOpts = defaultOpts === undefined && Array.isArray(paramOpts)
              ? paramOpts
              : Object.assign({}, defaultOpts, paramOpts, childOpts);

            try {
              // add plugin to plugins list
              const pluginPath = resolveFromFile && rule.source.input.file
                ? resolveFrom(
                  path.dirname(rule.source.input.file),
                  pluginName
                )
                : pluginName;

              const newPlugin = require(pluginPath)(pluginOpts);

              plugins.push(newPlugin);
            }
            catch (error) {
              throw new Error(`Cannot find module '${pluginName}'`);
            }
          }
          else {
            throw new ReferenceError(`'${pluginName}' is not a valid PostCSS plugin.`);
          }
        }

        rule.remove();
      });

      if (plugins.length > 0) {
        const processor = postcss(plugins);
        const processed = processor.process(root, {...result.opts}).sync();
        root.replaceWith(processed.root);
      }
    }
  };
};

pluginPostcssUse.postcss = true;

// get options from params using functional notation
function getOptionsFromParams(params, list) {
  try {
    // as json
    return JSON.parse(params);
  }
  catch (error) {
    // as properties, split as declarations
    const options = {};
    const decls = list.comma(params);

    for (const decl of decls) {
      if (decl) {
        const declMatch = decl.match(optionRegExp);

        if (declMatch) {
          const [, property, value] = declMatch;

          try {
            options[property] = JSON.parse(value);
          }
          catch (error2) {
            options[property] = value;
          }
        }
        else {
          throw new SyntaxError(`Options must include a property and value`);
        }
      }
    }

    return options;
  }
}

// get options from rule childrem
function getOptionsFromRuleChildren(rule) {
  const options = {};

  if (rule.nodes) {
    for (const node of rule.nodes) {
      const {
        prop,
        selector,
        type,
        value
      } = node;

      if (type === 'decl') {
        try {
          // as json
          options[prop] = JSON.parse(value);
        }
        catch (error) {
          // as a string
          options[prop] = value;
        }
      }
      else if (type === 'rule') {
        // as nested options
        options[selector] = getOptionsFromRuleChildren(node);
      }
    }
  }

  return options;
}

export default pluginPostcssUse;
