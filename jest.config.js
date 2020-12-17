
module.exports = {

  testEnvironment            : 'node',
  moduleFileExtensions       : ['js', 'ts'],
  coveragePathIgnorePatterns : ["/node_modules/", "/test/"],
  testMatch                  : ['**/*.test.ts', '**/*.spec.ts'],
  transform                  : { '^.+\\.ts$': 'ts-jest' },
  verbose                    : false,
  collectCoverage            : true,

  coverageThreshold : {
    global : {
      branches   : 90,
      functions  : 95,
      lines      : 95,
      statements : 95,
    },
  },

  collectCoverageFrom: ["src/*.{js,ts}"]

};
