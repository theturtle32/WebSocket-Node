/**
 * Dependencies.
 */
var gulp = require('gulp');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');


gulp.task('lint', function() {
	return gulp.src(['gulpfile.js', 'lib/**/*.js', 'test/**/*.js'])
		.pipe(jshint('.jshintrc'))
		.pipe(jshint.reporter('jshint-stylish', {verbose: true}))
		.pipe(jshint.reporter('fail'));
});


gulp.task('test', function() {
	return gulp.src('test/mocha/test_*.js', {read: false})
		.pipe(mocha({
			reporter: 'spec',
			timeout: 2000,
			bail: true
		}));
});


gulp.task('default', gulp.series('lint', 'test'));
