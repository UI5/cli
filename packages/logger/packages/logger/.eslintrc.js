module.exports = {
    "env": {
        "node": true,
        "es6": true
    },
    "parserOptions": {
        "ecmaVersion": 8
    },
    "extends": ["eslint:recommended", "google"],
    "rules": {
        "indent": [
            "error",
            "tab"
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "double",
            { "allowTemplateLiterals": true }
        ],
        "semi": [
            "error",
            "always"
        ],
        "no-negated-condition": "off",
        "require-jsdoc": "off",
        "no-mixed-requires": "off",
        "max-len": ["warn", 120],
        "no-implicit-coercion": [
            2,
            { "allow": ["!!"] }
        ],
        "comma-dangle": "off",
        "no-tabs": "off",
        "no-console": "off", // to allow fallback in case of npmlog error
        'valid-jsdoc': [
            2,
            {
                requireParamDescription: false,
                requireReturnDescription: false,
                requireReturn: false,
                prefer: {return: 'returns'},
            }
        ],
    },
    "root": true
};
