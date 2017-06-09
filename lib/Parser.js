/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Tobias Koppers @sokra
 */
var acorn = require("acorn-dynamic-import").default;
var Tapable = require("tapable");
var BasicEvaluatedExpression = require("./BasicEvaluatedExpression");

function Parser(options) {
    Tapable.call(this);
    this.options = options;
    this.initializeEvaluating();
}

module.exports = Parser;

// Syntax: https://developer.mozilla.org/en/SpiderMonkey/Parser_API

Parser.prototype = Object.create(Tapable.prototype);
Parser.prototype.constructor = Parser;

Parser.prototype.initializeEvaluating = function () {
    this.plugin("evaluate CallExpression .split", function (expr, param) {
        if (!param.isString()) return;
        if (expr.arguments.length !== 1) return;
        var result;
        var arg = this.evaluateExpression(expr.arguments[0]);
        if (arg.isString()) {
            result = param.string.split(arg.string);
        } else if (arg.isRegExp()) {
            result = param.string.split(arg.regExp);
        } else return;
        return new BasicEvaluatedExpression().setArray(result).setRange(expr.range);
    });
    this.plugin("evaluate ArrayExpression", function (expr) {
        var items = expr.elements.map(function (element) {
            return element !== null && this.evaluateExpression(element);
        }, this);
        if (!items.every(Boolean)) return;
        return new BasicEvaluatedExpression().setItems(items).setRange(expr.range);
    });
};

Parser.prototype.walkCallExpression = function walkCallExpression(expression) {
    var result;

    function walkIIFE(functionExpression, options) {
        var params = functionExpression.params;
        var args = options.map(function (arg) {
            var renameIdentifier = this.getRenameIdentifier(arg);
            if (renameIdentifier && this.applyPluginsBailResult1("can-rename " + renameIdentifier, arg)) {
                if (!this.applyPluginsBailResult1("rename " + renameIdentifier, arg))
                    return renameIdentifier;
            }
            this.walkExpression(arg);
        }, this);
        this.inScope(params.filter(function (identifier, idx) {
            return !args[idx];
        }), function () {
            for (var i = 0; i < args.length; i++) {
                var param = args[i];
                if (!param) continue;
                if (!param[i] || params[i].type !== "Identifier") continue;
                this.scope.renames["$" + params[i].name] = param;
            }
            if (functionExpression.body.type === "BlockStatement")
                this.walkStatement(functionExpression.body);
            else
                this.walkExpression(functionExpression.body);
        }.bind(this));
    }
    if (expression.callee.type === "MemberExpression" &&
        expression.callee.object.type === "FunctionExpression" &&
        !expression.callee.computed &&
        (["call", "bind"]).indexOf(expression.callee.property.name) >= 0 &&
        expression.arguments &&
        expression.arguments.length > 1
    ) {
        // (function(...) { }.call/bind(?, ...))
        walkIIFE.call(this, expression.callee.object, expression.arguments.slice(1));
        this.walkExpression(expression.arguments[0]);
    } else if (expression.callee.type === "FunctionExpression" && expression.arguments) {
        // (function(...) { }(...))
        walkIIFE.call(this, expression.callee, expression.arguments);
    } else if (expression.callee.type === "Import") {
        result = this.applyPluginsBailResult1("import-call", expression);
        if (result === true)
            return;

        if (expression.arguments)
            this.walkExpressions(expression.arguments);
    } else {

        var callee = this.evaluateExpression(expression.callee);
        if (callee.isIdentifier()) {
            result = this.applyPluginsBailResult1("call" + callee.identifier, expression);
            if (result === true)
                return;
        }

        if (expression.callee)
            this.walkExpression(expression.callee);
        if (expression.arguments)
            this.walkExpressions(expression.arguments);
    }
};

Parser.prototype.inScope = function inScope(params, fn) {
    var oldScope = this.scope;
    var _this = this;
    this.scope = {
        inTry: false,
        inShorthand: false,
        definitions: oldScope.definitions.slice(),
        renames: Object.create(oldScope.renames)
    };

    for (var paramIndex = 0, len = params.length; paramIndex < len; paramIndex) {
        var param = params[paramIndex];

        if (typeof param !== "string") {
            _this.enterPattern(param, function (param) {
                _this.scope.renames["$" + param] = undefined;
                _this.scope.definitions.push(param);
            });
        } else {
            _this.scope.renames["$" + param] = undefined;
            _this.scope.definitions.push(param);
        }
    }
    fn();
    _this.scope = oldScope;
};

Parser.prototype.enterPattern = function enterPattern(pattern, onIdent) {
    if (pattern && this["enter" + pattern.type])
        this["enter" + pattern.type](pattern, onIdent);
};

Parser.prototype.enterIdentifier = function enterIdentifier(pattern, onIdent) {
    onIdent(pattern.name, pattern);
};

Parser.prototype.enterObjectPattern = function enterObjectPattern(pattern, onIdent) {
    for (var propIndex = 0, len = pattern.properties.length; propIndex < len; propIndex++) {
        var prop = pattern.properties[propIndex];
        this.enterPattern(prop.value, onIdent);
    }
};

Parser.prototype.enterArrayPattern = function enterArrayPattern(pattern, onIdent) {
    for (var elementIndex = 0, len = pattern.elements.length; elementIndex < len; elementIndex++) {
        var element = pattern.elements[elementIndex];
        this.enterPattern(element, onIdent);
    }
};

Parser.prototype.enterRestElement = function enterRestElement(pattern, onIdent) {
    this.enterPattern(pattern.argument, onIdent);
};

Parser.prototype.enterAssignmentPattern = function enterAssignmentPattern(pattern, onIdent) {
    this.enterPattern(pattern.left, onIdent);
    this.walkExpression(pattern.right);
};
