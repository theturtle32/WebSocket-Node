/**
 * Dependencies.
 */
var gulp = require('gulp');
var jshint = require('gulp-jshint');
// var nodeunit = require('gulp-nodeunit-runner');


gulp.task('lint', function() {
	return gulp.src(['gulpfile.js', 'lib/**/*.js'])
		.pipe(jshint('.jshintrc'))
		.pipe(jshint.reporter('jshint-stylish', {verbose: true}))
		.pipe(jshint.reporter('fail'));
});


// gulp.task('test', function() {
// 	return gulp.src('test/*.js')
// 		.pipe(nodeunit({reporter: 'default'}));
// });


gulp.task('default', gulp.series('lint'));
