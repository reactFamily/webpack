/*
    MIT License http://www.opensource.org/licenses/mit-license.php
    Author Tobias Koppers @sokra
*/
"use strict";
const ModuleDependency = require("./ModuleDependency");
const ModuleDependencyTemplateAsRequireId = require("./ModuleDependencyTemplateAsRequireId");

class CommonJsRequireDependency extends ModuleDependency {
    constructor(request, range) {
        super(request);
        this.range = range;
    }

    get type() {
        return "cjs require";
    }
}

CommonJsRequireDependency.Template = ModuleDependencyTemplateAsRequireId;

module.exports = CommonJsRequireDependency;
