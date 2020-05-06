"use strict";

/** @define {string} */ 
var HRTS_BUILD = 'dev';

window['Hrts'] = (function () {
	
	var arrayStats = function (arr) {
		var s = {
			min: null,
			max: null, 
			med: null,
			sum: null,
			sqsum: null,
			posmin: null,
			negmax: null,
		}
		
		if (!arr.length) {
			return s;
		}
		
		var sorted = arr.map(function (v) {return v*1}).sort(function (a, b) {
			return a - b;
		});
		
		s.min = sorted[0];
		s.max = sorted[sorted.length-1];
		s.med = sorted[(sorted.length/2)|0];
		
		for (var i = 0; i < sorted.length; i++) {
			var v = sorted[i]*1;
			
			if (s.posmin === null && v > 0) {
				s.posmin = v;
			}
			
			if (v < 0) {
				s.negmax = v;
			}
			
			s.sum += (v*1 || 0);
			
			s.sqsum += (v*v || 0);
		}
		
		s.mean = s.sum / arr.length;
		
		var variance = s.sqsum/arr.length - (s.sum/arr.length)*(s.sum/arr.length);
		
		s.stdev = Math.sqrt(variance);
		
		return s;
	}
	
	var Mlog = function (x) {
		return Math.log(x) / Math.LN10;
	}
	var Mpow = function (x) {
		return Math.pow(10, x);
	}
	
	var formatTimeDelta = function (sec, pad, maxparts, minparts) {
		minparts = minparts || 1;
		sec = Math.round(sec);
		
		var n = ''; 
		
		if (sec < 0) {
			n = '-';
			sec = Math.abs(sec);
		}
		
		var p = function (v) {
			return (pad && v < 10) ? '0'+v : v;
		}
		
		var parts = 0;
		var q = function (v, s) {
			if (maxparts && parts >= maxparts) {
				return '';
			}
			
			if (v === 0 && parts >= minparts) {
				return '';
			}
			
			parts++;
			
			return p(v) + s;
		}
		
		if (sec === 0) {
			return "now";
		}
		
		if (sec < 60) {
			return n+q(sec, "s");
		}
		
		var min = (sec/60)|0;
		sec = sec%60;
		
		if (min < 60) {
			return n+q(min, "m ")+q(sec, "s");
		}
		var hr = (min/60)|0;
		min = min%60;
		
		if (hr < 24) {
			return n+q(hr, "h ")+q(min, "m ")+q(sec, "s");
		}
		var d = (hr/24)|0;
		hr = hr%24;
		
		return n+q(d, "d ")+q(hr, "h ")+q(min, "m ")+q(sec, "s");
	}
	
	var formatTimeAbs = function (ts) {
		var pad = true;
		var p = function (v) {
			return (pad && v < 10) ? '0'+v : v;
		}
		var dte = new Date(ts);
		
		var now = new Date();
		
		var dateStr = '';
		if (dte.getDate() !== now.getDate()) {
			dateStr = " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dte.getDay()] + ", " + dte.getDate() + " " + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dte.getMonth()];
		}
		
		return p(dte.getHours()) + ":" + p(dte.getMinutes()) + dateStr;
	}

	// TODO: Coupling with drawyaxis
	var bestTickIval = function (range, mostticks) {
		var minIval = range / mostticks;
		var magnitude = Mpow(Math.floor(Mlog(minIval)));
		
		var residual = minIval / magnitude;
		//var ticks = Math.floor(range / (Math.ceil(residual)*magnitude));
		
		residual = [1, 2, 5, 10].filter(function (r) {
			return (r >= residual ? true : false)
		})[0];
		
		return Math.ceil(residual) * magnitude;
	}

	var mousePos = {x: 0, y: 0};
	window.addEventListener('mousemove', function (e) {
		mousePos.x = e.clientX;
		mousePos.y = e.clientY;
	}, {passive: true});
	
	var defaults = {
		debug: false,
		range: null,
		axisColor: "rgba(0, 0, 0, 1)",
		seriesColors: ['#00bcd4', '#8bc34a', '#ffeb3b', '#ff9800', '#ff5722'],
		multipliers: [],
		draw: [],	
		labels: [],	
		unit: '',	
		yreset: false,
		ystack: true,
		ytruncate: false,
		ymin: 'auto',
		ymax: 'auto',
		ysymmetry: true,
		xaxis: 'bottom',
		yscale: 'linear',
		title: '',	
		legend: 'auto',
		format: 'si',
		yaxis: 'right'
	};
	
	var optionHelp = {
		debug: 'Enables debug console logging etc.',
		range: 'x-axis range in seconds. e.g. 3600 = 1 hour. If null, range is determined from data.',
		axisColor: 'Axis line and label font colour.',
		seriesColors: 'Array of colour values.',
		multipliers: 'Array of series value multipliers, e.g. -1 to invert.',
		draw: 'Array of "line" or "bar" for series.',
		labels: 'Array of series names.',
		unit: 'Unit for y-axis values (all series) e.g. "V" or "byte".',
		format: 'Value formatter. Use "si" for built-in SI-prefix formatter, or "exp" for exponential notation. Provide a function for custom formatting.',
		yscale: 'y-axis scale function: "linear" or "log". Log scale accommodates negative and zero values.',
		yreset: 'If true, ymin/ymax are reset each update, so the axis scale conforms to currently-displayed data. Otherwise, axis has "state".',
		ystack: 'If true, series values at each time point are summed for display. Not applicable for log scale.',
		ytruncate: 'If true, the y-axis is not forced to include zero. Not applicable for log scale.',
		ymax: 'Set the maximum displayed y-value. Value of "auto" tries to find "nice" limits. Use "exact" to follow actual data max/min.',
		ymin: 'As for ymax. ',
		ysymmetry: 'Centers the origin if there is data both above and below zero, when ymin and ymax are auto. Not applicable (always true) for log scale.',
		title: ' Title for the chart',
		legend: 'Series legend position. Use "fixed" to position with title, "auto" to follow data, or "none" to disable.',
		xaxis: 'X-axis position: "bottom", "zero", "none".',
		yaxis: 'Y-axis position: "right" or "none".'
	}
	
	return {
		options: defaults,
		help: function () {
			console.group('Hrts options');
			var tbl = [];
			for (var i in defaults) {
				console.log('%c'+i+' %c '+optionHelp[i], 'font-weight: bold', '');
				console.log(defaults[i]);
			}
			console.groupEnd();
			
			return optionHelp;
		},
		create: function (container, datatable, options) {
			var $container = (typeof container === "string" ? document.getElementById(container) : container);
			var opts = {};
			var data = [];
			var xrange;
			var xvals;
			var curVals = [];
			var xres;
			var ctx, ctxUI;
			var $canvas, $canvasUI;
			var yscale, ymax, ymin;
			var valueBarWidth;
			var curValsChanged = false;
			var curValSums = [];
			var curValCnts = [];
			var xlookup = [];
			
			var sumvals = {pos: [], neg: []};
			var globalMax = -Infinity;
			var globalMin = Infinity;
			
			var formatter;
			
			// Argh... scaler parameters continued...
			var ordPos = 0, ordPosOff = 0;
			var ordNeg = 0, ordNegOff = 0;
			var globalMinPos = Infinity;
			var globalMaxNeg = -Infinity;

			var drawSeries = function () {			
				var ysums = {pos: [], neg: []};
				var yrems = {pos: [], neg: []};
				
				var med = 0, stdev = 0;

				if (!xvals.length) {
					return;
				}

				var shiftTo = 0;
				for (var i = 0; i < xvals.length; i++) {
					if (xvals[i] + td < xrange) {
						break;
					}
					shiftTo = i;
				}
				var xrem = xvals.splice(0, shiftTo);
				
				// Fix first xval to prevent full-width horizontal glitching.
				if (xrem.length) {
					xvals[0] = xrem[0];
				}

				for (var k = 0; k < data.length; k++) {
					data[k].splice(0, shiftTo);
				}
				
				sumvals.pos.splice(0, shiftTo);
				sumvals.neg.splice(0, shiftTo);
				
				// Dimensioning / scaling the plot has to happen after historical data has 
				// been trimmed. 
				
				if (opts['yreset']) {
					globalMin = Infinity;
					globalMax = -Infinity;
				}
				
				for (var k = 0; k < data.length; k++) {
					var sstats = arrayStats(data[k]);
					globalMin = Math.min(sstats.min, globalMin, curVals[k]);
					globalMax = Math.max(sstats.max, globalMax, curVals[k]);
										
					if (sstats.posmin !== null) {
						globalMinPos = Math.min(sstats.posmin, globalMinPos, curVals[k] > 0 ? curVals[k] : Infinity);
					}
					if (sstats.negmax !== null) {
						globalMaxNeg = Math.max(sstats.negmax, globalMaxNeg, curVals[k] < 0 ? curVals[k] : -Infinity);
					}
				}
				
				if (opts['debug']) {
					console.log(globalMaxNeg, globalMinPos, sstats.posmin, sstats.negmax);
				}

				if (opts['yscale'] !== 'log') {

					if (!opts['ystack']) {
						ymax = globalMax;
						ymin = globalMin;
					}
					else {
						var sstatsPos = arrayStats(sumvals.pos);
						var sstatsNeg = arrayStats(sumvals.neg);
						
						if (sstatsPos.sum) {
							ymax = Math.max(sstatsPos.max, globalMax);
							
							if (!sstatsNeg.sum) {
								ymin = Math.min(sstatsPos.min, globalMin);
							}
						}
						if (sstatsNeg.sum) {
							ymin = Math.min(globalMin, sstatsNeg.min);
							
							if (!sstatsPos.sum) {
								ymax = Math.max(globalMax, sstatsNeg.max);
							}
						}
						
						if (opts['debug']) {
							console.log(sstatsPos, sstatsNeg);
						}
					}
				
					if (!opts['ytruncate']) {
						// It's usually not desirable to have the y-axis offset from zero.
						// We force ymin to zero, unless the option is set, or our data crosses zero already.
						if (ymax > 0 && ymin > 0) {
							ymin = 0;
						}
						if (ymax < 0 && ymin < 0) {
							ymax = 0;
						}
					}
					
					// Round the axis limits with reference to magnitude of range. 
					// This is not always desirable, e.g. when there is a physical limit, 
					// like system memory, or a logical one, like probability.
					// Nor does this in any case guarantee visual margin on the axes, i.e. a series can still hit 
					// the top or bottom pixel if its ymax/ymin happens to be round. 
					var absrange = Math.abs(ymax - ymin);
					if (absrange > 0) {
						var rangeMag = Math.floor(Mlog(absrange));
						
						if (opts['ymax'] === 'auto') {
							ymax = Math.ceil(ymax / Mpow(rangeMag)) * Mpow(rangeMag);
						}
						if (opts['ymin'] === 'auto') {
							ymin = Math.floor(ymin / Mpow(rangeMag)) * Mpow(rangeMag);
						}
					}
				}
				
				if (typeof opts['ymax'] === "number") {
					ymax = opts['ymax'];
				}
				if (typeof opts['ymin'] === "number") {
					ymin = opts['ymin'];
				}

				var absmax = Math.max(Math.abs(ymin), ymax);
				if (opts['ysymmetry'] && ymax > 0 && ymin < 0) {
					// Centre the origin/zero.
					// Note this option sits awkwardly (mutually-exclusive?) with ytruncate
					// because it only makes sense for charts that cross zero.
					ymin = -absmax;
					ymax = absmax;
				}
				
				
				if (opts['yscale'] === 'log') {
					
					if (opts['ystack']) {
						console.warn('Log scale does not support ystack option: ignoring.');
						opts['ystack'] = false;
					}
					if (!opts['ysymmetry']) {
						console.warn('Log scale requires y-axis symmetry in mirror mode.');
						opts['ysymmetry'] = true;
					}
					
					// TODO: ytruncate also doesn't make sense; by definition log charts never go to zero.
					// TODO: ymin, ymax overrides... 
					// TODO: Can simplify the below... if symmetry always required (which I think makes sense) 
					// then ordNeg/ordPos and ordNegOff/ordPosOff are redundant.
					
					ordNeg = ordPos = ordPosOff = ordNegOff = ymin = ymax = 0;
					
					ymin = globalMin;
					ymax = globalMax;
					
					if (ymin >= 0 && ymax > 0) {
						// Positive-only plot
						ymin = Mpow(Math.floor(Mlog(ymin)));
						ymax = Mpow(Math.ceil(Mlog(ymax)));
						ordPosOff = Mlog(ymin);
						ordPos = Mlog(ymax) - ordPosOff;
					}
					else if (ymin <= 0 && ymax < 0) {
						// Negative-only plot
						ymin = -Mpow(Math.ceil(Mlog(-ymin)));
						ymax = -Mpow(Math.floor(Mlog(-ymax)));
						ordNegOff = Mlog(-ymax);
						ordNeg = Mlog(-ymin) - ordNegOff;
					}
					else {
						// Origin-crossing / "mirror" plot.
						
						ymin = -Mpow(Math.ceil(Mlog(-ymin)));
						ymax = Mpow(Math.ceil(Mlog(ymax)));
						
						// "Outer" symmetry
						ymax = Math.max(ymax, -ymin);
						ymin = -ymax;

						ordPosOff = (globalMinPos !== Infinity ? Math.floor(Mlog(globalMinPos)) : 0);
						ordPos = Mlog(ymax) - ordPosOff;
						
						ordNegOff = (globalMaxNeg !== -Infinity ? Math.floor(Mlog(-globalMaxNeg)) : 0);
						ordNeg = Mlog(-ymin) - ordNegOff;
						
						// "Inner" symmetry - approaching origin/zero.
						ordPos = Math.max(ordNeg, ordPos);
						ordPosOff = -Math.max(-ordNegOff, -ordPosOff);
						ordNeg = ordPos;
						ordNegOff = ordPosOff;

					}
						
					if (opts['debug']) {
						console.log(ymin, ymax, ordPos, ordNeg, ordPosOff, ordNegOff, globalMaxNeg, globalMinPos);
					}
					
					yscale = function (y) {
						if (Math.abs(y) < 1E-100) {
							return 0;
						}

						return (y < 0 ? ordNegOff -Mlog(-y) : Mlog(y) - ordPosOff)
							* ($canvas.height / (ordPos+ordNeg));
					}

				}
				
				ctx.save();
				ctx.translate($canvas.width -1*pixelsTranslated - valueBarWidth, yscale(ymax)|0);

				
				if (opts['debug']) {
					ctx.fillStyle = "rgba(0, 0, 0, 1)";
					ctx.fillRect(-10, -10, 20, 20);
				}
				
				xlookup = [];
				
				var canvasWidth = $canvas.width;
				
				//console.log(canvasWidth, pixelsTranslated);

				for (var k = 0; k < data.length; k++) {
					var xaccum = (xvals[0]/xres);	// = xstart
					var erraccum = 0;
					var overflow = 0;
					xlookup[k] = [];
					var p = 0;
					
					ctx.fillStyle = opts['seriesColors'][k % opts['seriesColors'].length];
					ctx.strokeStyle = opts['seriesColors'][k % opts['seriesColors'].length];
					ctx.lineCap = "square";
					
					ctx.beginPath();
					for (var i = 0; i < data[k].length; i++) {
						var x0val = xvals[i];
						var x1val = xvals[i+1];
						var yval = data[k][i]*1;
						
						// Width is either distance to next value, or for last element, distance to origin. 
						var w = (i < data[k].length-1) ? (x0val - x1val)/xres : (x0val + td)/xres + 2;	// +2 to prevent single-pixel glitching.

						if (typeof ysums.pos[i] === "undefined") {
							ysums.pos[i] = 0;
							ysums.neg[i] = 0;
							yrems.pos[i] = 0;
							yrems.neg[i] = 0;
						}
						
						var ysum = ysums[yval >= 0 ? 'pos' : 'neg'][i];
						var yrem = yrems[yval >= 0 ? 'pos' : 'neg'][i];
						
						if (!opts['ystack']) {
							ysum = 0;
							yrem = 0;
						}
						
						//console.log(ysum, yrem, yval);
						
						// Trickery! The first series with a non-zero value should always have at least 1px height, to 
						// distinguish a rounding-down from a true zero (blank chart). 
						// TODO: Apply to diverging stacks' lower stack
						// TODO: Implement in UILayer as well. 
						if (ysum === 0 && yval !== 0 && (yscale(yval)|0) === 0) {
							yrem = 1;
						}
			
						var px = -1*(xaccum)|0;
						var pw = (w + overflow)|0;
						var py = -1*ysum|0;
						var ph = -1*(yscale(yval) + yrem)|0;						

						var type = (typeof opts['draw'][k] === "string" ? opts['draw'][k] : 'bar');
						
						if (type === 'line') {
							// Almost perfect lines
							// Off by a pixel in width; not sure we can fix without additional state. 
							// On straight lines, we shouldn't have two lineTos, but we'd need to know y has not changed.
							ctx.lineWidth = 1;
							var aa = 0.5;
							ctx.lineTo(px + aa, 		py + ph + aa);
							ctx.lineTo(px + aa + pw, 	py + ph + aa);
						}
						else {
							ctx.fillRect(px, py, pw, ph);
						}
						
						xaccum -= pw;
						
						erraccum += (w)%1;		// (xstart - xaccum)%1 not needed: always round if xstart is round.
						
						overflow = 0;
						if (erraccum > 1) {
							overflow = (erraccum|0);
							erraccum -= (erraccum|0);	
						}
						
						//ctx.font = '12px sans-serif';
						//ctx.fillText("OK"+i, -1*xaccum, 0);

						ysums[yval >= 0 ? 'pos' : 'neg'][i] += yscale(yval);
						yrems[yval >= 0 ? 'pos' : 'neg'][i] = (yscale(yval) - yscale(ymin) + yrem)%1; 
						
						for (;p < canvasWidth - (xaccum) - pixelsTranslated - valueBarWidth; p++) {
							xlookup[k][p] = yval;
						}

					}
					ctx.stroke();
				}

				ctx.restore();
				
				// Shows red bar indicating duration of extrapolated data (time since last update)
				ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
				ctx.fillRect($canvas.width-valueBarWidth, $canvas.height - 10, -(td - tdLastUpdate)/xres + 1, 10);
				
				drawCurVals();
				drawYAxis();
			}
			
			var tdLastUpdate = 0;
			
			var drawCurVals = function () {
				
				ctx.save();
				
				ctx.translate($canvas.width, 0);
				ctx.clearRect(0, 0, -valueBarWidth, $canvas.height);

				ctx.translate(0, yscale(ymax)|0);
				
				var pixelOffset = {pos: 0, neg: 0};
				var pixelRem = {pos: 0, neg: 0};
				
				

				for (var k = 0; k < curVals.length; k++) {
					ctx.fillStyle = opts['seriesColors'][k];
					ctx.strokeStyle = opts['seriesColors'][k];
					ctx.beginPath();
					
					var yval = curVals[k];
					
					var lineHeight = 1;
					
					var pxH = (yscale(yval) + pixelRem[yval >= 0 ? 'pos' : 'neg'])|0;
					var pxOff = pixelOffset[yval >= 0 ? 'pos' : 'neg'];
					
					if (!opts['ystack']) {
						pxOff = 0;
						pxH = yscale(yval)|0;
					}
					
					var type = (typeof opts['draw'][k] === "string" ? opts['draw'][k] : 'bar');
					
					if (type !== 'line') {
						ctx.fillRect(-valueBarWidth, -pxOff, valueBarWidth, -1*pxH);
					}
					
					ctx.save();
					ctx.globalCompositeOperation = "multiply";					
					//ctx.fillStyle = "rgba(255, 0, 0, 1)";
					ctx.fillRect(-valueBarWidth, -pxOff -1*pxH, valueBarWidth, (yval >= 0 ? 1 : -1) * lineHeight);
					ctx.restore();
					
					pixelOffset[yval >= 0 ? 'pos' : 'neg'] += pxH;
					pixelRem[yval >= 0 ? 'pos' : 'neg'] += (yscale(yval) + pixelRem[yval >= 0 ? 'pos' : 'neg'])%1;				
				}
				
				ctx.restore();
			}
			
			var yAxisIndex = 1;
			
			var drawYAxis = function () {
				
				if (opts['yaxis'] === 'none') {
					return;
				}
				
				var tickFontSize = 12;
				var tickIval = bestTickIval((ymax-ymin), ($canvas.height) / (tickFontSize*2));
				
				var tick = ymax;	// Or to start evenly-spaced: Math.floor(ymax / tickIval) * tickIval;
				
				// TODO: 
				// - Allow display SI suffix to be fixed, or configured. 
				//	For example, load average should be displayed as 0.XX, not "XX0 m"
				//	Meanwhile 1.00Gb and 500Mb can logically be shown together. 
				//  
				
				// TODO: This interacts with formatter e.g. default 3 sig figs is because 
				// formatter finds the nearest SI factor of 1000.
				// Yet here we want to add precision when yrange is fractional.
				// Idea is to prevent axis labels and values being shown as "the same"
				// when we have a large "common-mode" value and small range. 
				// We might also want to differentiate axis labels from series labels; 
				// the latter can/should be more precise
				// TODO: Still very hacky... could perhaps base it on actual pixel resolution, 
				// Although this makes less sense for log vs. linear scale.
				var oTickIval = Math.floor(Mlog(Math.abs(tickIval||1)));
				var oYMax = Math.floor(Mlog(Math.max(Math.abs(ymax), Math.abs(ymin))||1));
				
				// Range e.g. 100.00 - 100.01 => sigFigs 5
				var sigFigs = Math.max(3, 2 + (oYMax - oTickIval));
				
				//console.log(opts['title'], oYMax, oTickIval, sigFigs);
				
				formatter.numberFormat = new Intl.NumberFormat('en-US', {minimumSignificantDigits: sigFigs, maximumSignificantDigits: sigFigs});			
				
				ctx.save();

				// Axis border, from default (top-left) origin.
				ctx.beginPath();
				ctx.fillStyle = opts['axisColor'];
				ctx.fillRect($canvas.width-valueBarWidth*yAxisIndex, 0, 1, $canvas.height);
				
				// Translate origin for ticks. 
				ctx.translate($canvas.width, (yscale(ymax)|0) - 1);

				//console.log("TICK", tick, mag, $canvas.height + (ymin*yscale)|0);
				
				ctx.font = tickFontSize + "px sans-serif";
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";

				var pxOffLast = null;
				
				var ticks = 0;

				while (tick >= ymin && ticks < 100) {
					
					// TOFIX: 3 sig figs isn't always enough. 
					// Consider 23.0 to 24.0 is range, and tick ival is 0.05. 
					var label = formatter(tick);
					
					var pxOff = yscale(tick);
					
					var pxOffText = pxOff;
					var textShim = 1;
					
					//console.log(tick, pxOff);
					
					if (pxOff - yscale(ymin) < tickFontSize/2) {
						pxOffText = yscale(ymin) + tickFontSize/2;		// Bottom-clip adjust
					}

					if (pxOff - yscale(ymin) > $canvas.height - tickFontSize/1.8) {
						pxOffText = $canvas.height + yscale(ymin) - tickFontSize/1.8;		// Top-clip adjust
					}
					

					if (pxOffLast === null || pxOffLast - pxOff >= tickFontSize*2) {
						ctx.beginPath();
						ctx.fillRect(-valueBarWidth*yAxisIndex, (-1*pxOff + 0.5)|0, -5, 1);	// Extending into chart makes negative vals (sign) less ambiguous.
					
						ctx.fillText(label, -valueBarWidth*yAxisIndex + 5, -1*pxOffText + textShim);
						pxOffLast = pxOff;	// Or pxOffText?
					}
					
					if (opts['yscale'] === 'log') {
						// tickIval meaningless here. 
						if (ticks === 0) {
							tick = (ymax < 0 ? -1 : 1)*Mpow(Math.floor(Mlog(Math.abs(ymax))));
						}
						
						if (tick === 0) {
							tick = -Mpow(ordNegOff);
						}
						else if (tick < 0) {
							tick *= 10;
						}
						else {
							tick /= 10;
							
							if (ticks >= ordPos) {
								// Flip across zero...
								tick = 0;
							}
						}

					}
					else {
						
						if (ticks === 0) {
							// If (top-most) tick is ymax-clamped, next is the largest zero-based tick.
							tick = Math.floor(ymax / tickIval) * tickIval;

						}
						else {
							tick -= tickIval;
						}
						
						if (tick - tickIval < ymin) {
							// If next tick would be below ymin, clamp this one to ymin.
							tick = ymin;
						}
					}
					
					ticks++;
					
				}

				ctx.restore();
				
				ctx.save();
				ctx.font = "10px sans-serif";
				ctx.globalCompositeOperation = "screen";
				ctx.translate($canvas.width, $canvas.height);
				ctx.rotate(-90 * Math.PI/180);
				ctx.fillStyle = "#aaad";
				ctx.fillText("HRTS", 0, 0);
				ctx.restore();
				//yAxisIndex++;
			}
			
			var drawNightOverlay = function () {
				
				var numDays = Math.ceil(xrange / 86400);
				
				if (numDays <= 0 || numDays > 7) {
					// Heuristically disabled
					return;
				}
				
				var d = new Date();
				d.setHours(0);
				d.setMinutes(0);
				d.setSeconds(0);
				
				var n = new Date();
				
				ctx.save();
				ctx.translate($canvas.width - valueBarWidth, $canvas.height);

				ctx.lineWidth = 1;
				ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
				
				var secSinceMidnight = (n - d)/1000;
				
				//console.log(secSinceMidnight);
				
				//ctx.globalCompositeOperation = "multiply";
				
				for (var i = -1; i < numDays; i++) {
					var pxMidnight = ((86400*i + secSinceMidnight) / xres)|0;
					var pxStart = pxMidnight + ((3600*6/xres)|0);					
					var pxWidth = ((3600*13) / xres)|0;					

					var gradient = ctx.createLinearGradient(-1*pxStart, -$canvas.height, -1*pxStart + 1*pxWidth, -$canvas.height);
					gradient.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
					gradient.addColorStop(.4, 'rgba(0, 0, 0, 0.3)');
					gradient.addColorStop(.5, 'rgba(0, 0, 0, 0.4)');
					gradient.addColorStop(.6, 'rgba(0, 0, 0, 0.3)');
					gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
					
					// Clip with respect to origin (valuebar)
					if (-pxStart + pxWidth > 0) {
						pxWidth = pxStart;
					}
					
					if (pxStart < 0) {
						continue;
					}

					ctx.fillStyle = gradient;	// "rgba(0, 0, 0, 0.3)";	// Or 
					
					ctx.fillRect(-1*pxStart, 0, pxWidth, -$canvas.height);
					
					/* Disabled midnight marker - too much like a tick.
					if (pxMidnight > 0) {
						ctx.moveTo(-1*pxMidnight - 0.5, 0);
						ctx.lineTo(-1*pxMidnight - 0.5, -15);
						ctx.stroke();
					}
					*/
				}
				
				ctx.restore();
			}
			
			var legendTopMargin = 10;

			var drawXAxis = function () {
				
				if (opts['xaxis'] === 'none') {
					return;
				}
				
				var tickFontSize = 12;
				var titleFontSize = 14;
				// TODO: Calculate based on actual max tick label width.
				// Can also get smart numXticks by looking at scale, e.g. 7 days => 7 or 14 ticks logical. 
				// We do this very crudely for day-multiple scales. 
				// But in general we can find factors especially of 12.
				
				var minTickWidth = 70;		

				var maxTicks = $canvas.width / minTickWidth;
				
				
				
				var rangePerTick = xrange / maxTicks;
				
				if (rangePerTick < 30) {
					rangePerTick = Math.ceil(rangePerTick / 5) * 5;
				}
				else if (rangePerTick < 60) {
					rangePerTick = Math.ceil(rangePerTick / 15) * 15;
				}
				else if (rangePerTick < 3600) {
					var mins = Math.ceil(rangePerTick / 60);
					
					mins = [5, 15, 30, 60].filter(function (m) {
						return (m >= mins ? true : false)
					})[0] || 60;
					
					// TOFIX: Round up to the nearest of the allowed intervals, 
					// rather than multiplying the next interval down (which leads to 
					// new intervals, e.g. 5*2 = 10 minutes... defeating the point). 

					
					rangePerTick = (mins*60);
				}
				else if (rangePerTick < 86400) {
					var hrs = Math.ceil(rangePerTick / 3600);
					
					hrs = [12, 6, 3].filter(function (h) {
						return (hrs >= h ? true : false)
					})[0] || 3;
					
					rangePerTick = Math.ceil(rangePerTick / (hrs*3600)) * (hrs*3600);
				}
				else {
					rangePerTick = Math.ceil(rangePerTick / 86400) * 86400;
				}
				
				var tickLineHeight = tickFontSize * 3;	// Min space per Y tick.
			
				ctx.save();
				
				if (opts['xaxis'] === 'zero') {
					// TODO: Accept numerical value 
					ctx.translate($canvas.width - valueBarWidth, $canvas.height + 0.5 + yscale(ymin)|0);
				}
				else {
					// Bottom
					ctx.translate($canvas.width - valueBarWidth, $canvas.height);
				}
			
				ctx.font = tickFontSize + "px sans-serif";
				ctx.fillStyle = opts['axisColor'];
				ctx.textBaseline = "bottom";
				ctx.textAlign = "left";
				
				// Skips the first (zero'th) tick, which otherwise overlaps curVals/y-axis.
				var tick = 0;
				while ((tick += rangePerTick) <= xrange && !isNaN(tick) && !isNaN(xrange)) {

					var val = tick;
				
					var label = formatTimeDelta(val, false, 2);
					
					// Note -xmin to get it into relative position
					//var pxOff = this.settings.tickYLength + this.settings.labelYWidth + ((val-xmin) * scaleX)|0;
					var pxOff = ((val) / xres)|0;
					
					ctx.beginPath();
					ctx.fillRect(-1*pxOff, 0, 1, -tickFontSize);
					ctx.fillText(label, -1*pxOff + 5, 0);
				}
				
				ctx.restore();

				if (typeof opts['title'] === "string" && opts['title'].length) {
					ctx.font = titleFontSize + "px sans-serif";
					var tw = ctx.measureText(opts['title']).width;
					ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
					ctx.fillRect(10, 10, tw + 20, 20);
					ctx.fillStyle = "#fff";
					ctx.fillText(opts['title'], 20, 25);
					
					legendTopMargin = 10 + 20;
				}
			}
			
			if ($container.clientHeight === 0) {
				console.warn("Container height is zero; setting default height.");
				$container.style.height = "100px";
			}

			var resize = function ($c) {
				// No extra pixel density. This is a pixel chart!
				$c.width = pWidth = $container.clientWidth * 1;
				$c.height = pHeight = $container.clientHeight * 1;
			}

			var canvasBaseCSS = "width: 100%; height: 100%; margin: 0; padding: 0;";
			$canvas = document.createElement('canvas');
			$canvas.style = canvasBaseCSS;
			
			$canvasUI = document.createElement('canvas');
			$canvasUI.style = canvasBaseCSS + "position: absolute; left: 0; top: 0;";
			
			resize($canvas);
			resize($canvasUI);

			// Resetting container required if create() is to clean up for subsequent call
			// But the cost is losing ability to place additional elements. So another option 
			// is to require a cleanup() if calling multiple create().
			//$container.innerHTML = '';
			$container.style.position = "relative";
			$container.appendChild($canvas);
			$container.appendChild($canvasUI);
			
			
			
			var pWidth = 0;
			var pHeight = 0;
			window.addEventListener("resize", function () {
				if ($container.clientWidth === pWidth && $container.clientHeight === pHeight) {
					return;
				}
				pWidth = $container.clientWidth;
				pHeight = $container.clientHeight;
				
				resize($canvas);
				resize($canvasUI);
				drawAll();
			}, {passive: true});
			
			
			var pixelsPerSec = 0;
			var pixelsTranslated = 0;
			var pixelRem = 0;
			var drawIval = 0;
			var tmrAnim = null;
			var tmrUpdate = null;
			var t0 = 0;
			var td = 0;
			
			ctx = $canvas.getContext('2d');
			ctxUI = $canvasUI.getContext('2d');

			if (typeof datatable === "undefined" || datatable === null) {
				datatable = [[], []];
			}
			else if (typeof datatable === "number") {
				var numSeries = (datatable|0);
				datatable = [[]];
				for (var i = 0; i < numSeries; i++) {
					datatable.push([]);
				}				
			}
			else if (!Array.isArray(datatable) || !Array.isArray(datatable[0]) || !Array.isArray(datatable[1])) {
				ctx.fillText("Data must be an array of arrays: [times, values]", 10, 10);
				return;
			}

			var largeTS = 0;
			
			// Make a copy
			xvals = datatable[0].map(function (v) {
				if (v > 1E9) {
					largeTS++;
				}
				return v;
			});

			if (!Array.isArray(xvals)) {
				console.error("First data element must be array of x values (relative time, seconds)");
				return;
			}

			if (largeTS) {
				console.warn("Timestamp large value ("+largeTS+"/"+xvals.length+"). Are they relative, in seconds?");
				return;
			}
			
			// TODO: 
			// - Check for overlapping data. 
			// - Check sort order.
			// - Merge/aggregate if downsampling is necessary
			//		(Without this, with high-res data, some values are just going to be zero-width "at random")
			//		(note this will depend on xrange, so may need to be re-calculated at setup() or similar.)


			for (var k = 1; k < datatable.length; k++) {
				if (!Array.isArray(datatable[k])) {
					console.warn("Missing a data series at index " + k + (options && options.labels ? ' ('+options.labels[k-1]+')' : ''));
					continue;
				}
				
				if (datatable[k].length !== xvals.length) {
					// Can make them match by taking just the N last values, or N first. 
					// But which? This is symptom of separate time series from data series, 
					// given a data series can be added later or removed. 
					console.warn("Data length doesn't match xval length at "+k);
					continue;
				}
				
				var series = [];

				for (var i = 0; i < datatable[k].length; i++) {
					var val = datatable[k][i]*1;
					
					if (options && options['multipliers'] && typeof options['multipliers'][k-1] === "number") {
						val *= options['multipliers'][k-1]*1;
					}
					
					series.push(val);
					
					if (typeof sumvals.pos[i] === "undefined") {
						sumvals.pos[i] = 0;
						sumvals.neg[i] = 0;
					}
					sumvals[(val >= 0 ? 'pos' : 'neg')][i] += val;
				}

				data.push(series);
				
				if (series.length) {
					curVals[k-1] = data[data.length-1][data[data.length-1].length-1]*1;
				}
			}
					
			var drawUpdate = function () {
				if (tmrUpdate !== null) {
					window.clearTimeout(tmrUpdate);
					tmrUpdate = null;
				}
				
				var t = window.performance.now();
				
				if (!t0) {
					t0 = t;
				}
				
				td = (t - t0)/1000;
				
				var pixels = pixelsPerSec * td;
				
				if (t0 !== t && pixelsTranslated && pixels - pixelsTranslated < 1) {
					pixelRem += pixels;
					
					tmrUpdate = window.setTimeout(drawUpdate, drawIval);
					return;
				}
				
				if (chart && chart.callback) {
					chart.callback();
				}

				/* 
				For performance and visual smoothness, we only add new datapoint 
				if one or more of the current values have changed, or if updates are 
				not happening frequently or at all, we inject a datapoint at half the 
				xrange. 
				
				curVals are aggregated to a mean value, rather than simply taking the value 
				of the last update. This is so the chart works as expected (in most cases) 
				even if data-update rate is "too high". 
				*/

				if (curValsChanged || xvals[xvals.length-1] + td >= xrange/2) {
					var sumpos = 0;
					var sumneg = 0;
					for (var k = 0; k < data.length; k++) {
						
						var mean = curVals[k]*1;
						
						if (curValCnts[k]) {
							mean = curValSums[k] / curValCnts[k];
						}
						
						if (mean >= 0) {
							sumpos += mean;
						}
						else {
							sumneg += mean;
						}
						data[k].push(mean);
					}
					sumvals.pos.push(sumpos);
					sumvals.neg.push(sumneg);
					
					xvals.push((-1*td));
					curValsChanged = false;
				}
				
				for (var k = 0; k < data.length; k++) {
					// Reset even if not inserted into series this loop. 
					curValSums[k] = 0;
					curValCnts[k] = 0;
				}
				
				pixelsTranslated = (pixels|0);
				pixelRem = ((pixelRem + pixels)%1);
				
				if (tmrAnim !== null) {
					window.cancelAnimationFrame(tmrAnim);
					tmrAnim = null;
				}

				tmrAnim = window.requestAnimationFrame(function () {

					// Uncoupling is important for performance especially mobile with multiple charts.  
					ctx.resetTransform();
					ctx.clearRect(0, 0, $canvas.width, $canvas.height);

					drawSeries();
					drawNightOverlay();
					drawXAxis();
					drawUILayer();	// Required for end-point "dots".
					
					tmrAnim = null;
				});
				
				tmrUpdate = window.setTimeout(drawUpdate, drawIval);
			};
			

			
			// There's an idea in here. Max 20 fps when more than one pixel per second. Some minimum interval as well and movement conditional.

			var x = 0, y = 0;
			var textpos = {x: 0, y: 0}, wtext, htext;

			
			var xinit = null;
			var yinit = null;
			
			var drawUILayer = function () {
				
				var bbox = $canvasUI.getBoundingClientRect();
				var ctx = ctxUI;

				var lgdFontSize = 12;
				var x, y;
				var pxY = 0;
				
				/*
				Optimising this will have to wait...
				ctx.clearRect(x - 5, 0, 10, $canvasUI.height);
				ctx.clearRect(0, y-3, $canvas.width, 6);
				ctx.clearRect(0, pxY-3, $canvas.width, pxY+3);
				ctx.clearRect(textpos.x-15, textpos.y-15, wtext+30, htext+30);
				*/
				ctx.clearRect(0, 0, $canvas.width, $canvas.height);
				
				ctx.font = "normal "+lgdFontSize+"px monospace";
				ctx.textBaseline = "middle";
				//ctx.globalCompositeOperation = "screen";
				
				if (!uiActive || mousePos.x < bbox.left || mousePos.x > bbox.left + bbox.width || mousePos.y < bbox.top || mousePos.y > bbox.top + bbox.height) {
					// User mouse is out of bounding box.
					x = bbox.left + bbox.width;
					y = bbox.top + bbox.height;
				}
				else {
					x = mousePos.x - bbox.left;
					y = mousePos.y - bbox.top;
				}
				
				x = x|0;
				y = y|0;
				
				var t = new Date().getTime();
					
				ctx.lineWidth = 1;
				

				// +0.5 here is to work around aliasing. In canvas, lines are plotted "between" pixels. 
				ctx.strokeStyle = opts['axisColor'];
				ctx.setLineDash([8, 8]);
				
				if (true /*showVLine*/) {
					ctx.beginPath();
					ctx.lineDashOffset = -1*y - 4;		// This keeps the "ants" stationary relative to the "graticule"
					ctx.moveTo(x + 0.5, 0);
					ctx.lineTo(x + 0.5, $canvas.height);	// vertical line
					ctx.stroke();
				}
				
				/*
				if (false showHLine) {
					ctx.beginPath();
					ctx.lineDashOffset = -1*x - 4;		// This keeps the "ants" stationary relative to the "graticule"
					ctx.moveTo(0, y + 0.5);
					ctx.lineTo(0 + $canvas.width, y + 0.5);	// horizontal line
					ctx.stroke();
				}*/
				
				/*
				// The "graticule"
				ctx.clearRect(x - 6, y - 6, 12, 12);	// Clear space in centre
				ctx.beginPath();
				ctx.setLineDash([]);
				ctx.arc(x + 0.5, y + 0.5, 3, 0, 2*Math.PI);
				ctx.stroke();
				*/
				
				// The "crossbar"
				ctx.beginPath();
				ctx.setLineDash([]);
				ctx.moveTo(x - 10, y + 0.5);
				ctx.lineTo(x + 10, y + 0.5);
				ctx.stroke();
			
				// Goes negative over the right margin (curValue), so clamped. 
				var xsec = Math.max(0, $canvas.width - x - valueBarWidth);
				var tmeRel = formatTimeDelta(xsec * xres, true, 2, 2);
				var tmeAbs = formatTimeAbs(t - xsec * xres * 1000);
				
				if (xsec === 0) {
					x = $canvas.width - valueBarWidth;
				}
				
				// TOFIX: Requires inverse yscale()
				//var valAtCursor = (($canvas.height - y)/yscale) + ymin;
				
				if (mouseDown && xinit === null) {
					xinit = x;
					yinit = y;
				}
				if (!mouseDown && xinit !== null) {
					xinit = null;
					yinit = null;
				}
				
				if (xinit !== null) {
					ctx.fillStyle = "rgba(0, 100, 150, 0.2)";
					ctx.fillRect(x, 0, xinit - x, $canvas.height);
				}
							
				ctx.textAlign = "left";
			
				var pxYprev = {pos: 0, neg: 0};
				
				// TODO: Fix up "val" / "value" naming and consistency re. diverging stacks neg vals.

				var labels = [];
				var maxTextWidth = -Infinity;
				
				ctx.strokeStyle = opts['axisColor'];
				
				var originY = yscale(ymax);
				
				ctx.save();
				ctx.translate(0, originY|0);	// Same as for drawSeries, for same rounding.
					
				for (var k = 0; k < data.length; k++) {
					ctx.save();
					
					var valY = 0, valIgral = null;
					
					if (xsec === 0) {
						// equivalent to x == $canvas.width - valueBarWidth, but clearer.
						valY = curVals[k];
					}
					else {
						valY = xlookup[k][x];
					}

				
					if (xinit !== null) {
						
						var valSum = 0;
						var valN = 0;
						
						// Bi-directional (left-to-right or right-to-left selection)
						
						for (var p = Math.min(xinit, x); p <= Math.max(x, xinit); p++) {
							valSum += xlookup[k][p];
							valN++;
						}
						
						valY = valSum / valN;		// Hacky: the mean being used as "value"
						
						valIgral = (valSum/valN) * (Math.abs(x - xinit)*xres);
					}
					
					
					pxY = yscale(valY);
					

					if (!opts['ystack']) {
						
					}
					else {
						pxY += pxYprev[valY >= 0 ? 'pos' : 'neg'];
					}
					
					pxYprev[valY >= 0 ? 'pos' : 'neg'] += yscale(valY);

					var text = formatter(valY);
					
					var unit = '';
					if (typeof opts['unit'] === "string") {
						unit = opts['unit'];
					}
					
					if (valIgral !== null) {
						text = "x̅ " + text 
							+ (unit)
							+ ", Σ " + formatter(valIgral)
							+ ", Δ " + formatter(xlookup[k][x] - xlookup[k][xinit])
					}
					
					if (typeof opts['labels'][k] === "string") {
						text = opts['labels'][k] + ": " + text
					}
					
					text += unit;

					// Storing these for the second loop. 
					// Reason for second loop is to get label z-height above lines. 
					labels[k] = {
						text: text,
						pxY: pxY,
						textWidth: ctx.measureText(text).width,
						origIndex: k
					}
					
					if (labels[k].textWidth > maxTextWidth) {
						maxTextWidth = labels[k].textWidth;
					}
					
					ctx.strokeStyle = opts['seriesColors'][k];
					ctx.fillStyle = opts['seriesColors'][k];
					
					if (uiActive) {
						// Dot line
						// Trick to make it visible against its own series colour: 
						// Two lines, with dashes offset.
						// Alternatives involve having special dedicated colourr per series, 
						// or doing some sort of computation on the specified series colour. 
						// or separating the layers further and using CSS mix-blend-mode (globalCompositeOperation does not apply since this is a separate canvas)
						var yz = -(pxY|0) + 0.5;	// +0.5 is to get sharp lines. 
						ctx.lineDashOffset = 0;
						ctx.beginPath();
						ctx.setLineDash([1, 3]);
						ctx.moveTo(0, yz);		
						ctx.lineTo(0 + $canvas.width, yz);
						ctx.stroke();
						ctx.lineDashOffset = 2;
						ctx.strokeStyle = "#333";			// TODO: Should be chart BG
						ctx.beginPath();
						ctx.setLineDash([1, 3]);
						ctx.moveTo(0, yz);
						ctx.lineTo(0 + $canvas.width, yz);
						ctx.stroke();
						
						ctx.setLineDash([]);
					}

					// The "dot". 
					ctx.beginPath();
					ctx.arc(x + 0.5, -(pxY|0) + 0.5, 3, 0, 2*Math.PI);
					ctx.fill();

					if (uiActive) {
						ctx.strokeStyle = opts['axisColor'];
						ctx.stroke();
					}
					
					ctx.restore();
				}
				
				if (opts['legend'] === 'none') {
					labels = [];
				}
				
				// Sort from largest pxY to smallest (visually, top-to-bottom)
				labels.sort(function (a, b) {
					return b.pxY - a.pxY;
				});
				
				var lgdLineHeight = 20;
				var lgdBottomMinMargin = 
					lgdFontSize / 2;	// Because of text "middle" positioning
				
				var lgdToRight = false;
				var timeLabelToRight = true;
				
				if (x - maxTextWidth - 40 < 0) {
					lgdToRight = true;
					
				}
				
				var timeText = tmeRel + " ("+tmeAbs+")";
				
				if (xinit !== null) {
					var tmeDelta = formatTimeDelta((x - xinit)*xres, true, 2, 2);
					if (x - xinit == 0) {
						tmeDelta = '0';	// Replace "now"
					}
					timeText = 'Δ '+tmeDelta+ " ("+tmeAbs+")";
				}
				
				var tWidth = ctx.measureText(timeText).width + 10;
				
				if (x + tWidth > $canvas.width) {
					timeLabelToRight = false;
				}
				
				if (uiActive && !(timeLabelToRight ^ lgdToRight)) {
					// If time label and series labels might conflict, add margin.
					// Note if uiActive is false time label is not shown.
					lgdBottomMinMargin += lgdLineHeight;
				}
				
				// Push labels down 
				for (var k = 0, lastPxY = 0; k < labels.length; k++) {				
					if (k === 0 && originY - labels[k].pxY < lgdLineHeight / 2) {
						// First (top) label cut off at the top - this pushes it down by the amount it overflows. 
						labels[k].pxY = -lgdLineHeight / 2 + (originY);
					}
					
					else if (k > 0 && lastPxY - labels[k].pxY < lgdLineHeight) {
						labels[k].pxY = -lgdLineHeight + lastPxY;
					}

					lastPxY = labels[k].pxY;
				}
				
				// Now work backwards pushing labels up. 
				for (var k = labels.length-1, lastPxY = null; k >= 0; k--) {			
					if (lastPxY === null && labels[k].pxY + ($canvas.height - originY) < lgdBottomMinMargin) {
						// First (bottom) label is below min margin. Push up by amount. 
						labels[k].pxY = lgdBottomMinMargin - ($canvas.height - originY);
					}
					else if (lastPxY !== null && labels[k].pxY - lastPxY < lgdLineHeight) {
						labels[k].pxY = lastPxY + lgdLineHeight;
					}

					lastPxY = labels[k].pxY;
				}

				if (opts['legend'] === 'fixed') {
					ctx.restore();
					ctx.save();
					// TOFIX: Magic.
					ctx.translate(10, legendTopMargin + lgdLineHeight/2 + 2);
				}
				
				for (var k = 0; k < labels.length; k++) {
					ctx.save();
					
					pxY = labels[k].pxY;
					var text = labels[k].text;
					var wtext = labels[k].textWidth;
					
					//console.log(wtext, text, pxY);
					
					// TODO: Only makes sense for "rate" measurements.
					// Might make sense to take a time divisor as an option, e.g. 
					// 0 = off, 1 = seconds, 3600 = hours, especially if this can 
					// be used for automatic conversion.
					//if (!valIgrals[k]) {
					//	text += '/sec';
					//}
					

					if (opts['legend'] !== 'fixed') {
						// Align left of the cursor
						textpos = {x: x - wtext - 35, y: -pxY};
						if (lgdToRight) {
							// Shift all labels to right of cursor
							textpos.x = x + 10;
						}
					}
					else {
						textpos = {x: 0, y: k * lgdLineHeight}
					}

					ctx.beginPath();

					// Text background (has its own padding)
					ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; //(uiActive ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.3)");
						
					ctx.clearRect(textpos.x, (textpos.y - lgdLineHeight/2)|0, wtext + 25, lgdLineHeight - 2);
					ctx.fillRect( textpos.x, (textpos.y - lgdLineHeight/2)|0, wtext + 25, lgdLineHeight - 2);
					
					// Series-color marker
					ctx.fillStyle = opts['seriesColors'][labels[k].origIndex];
					ctx.arc(textpos.x + 10, (textpos.y - 1)|0, 6, 0, Math.PI*2);
					ctx.fill();
					//ctx.fillRect(textpos.x, (textpos.y - lgdLineHeight/2)|0, 8, lgdLineHeight - 2);
					
					ctx.beginPath();
					
					ctx.fillStyle = "rgba(255, 255, 255, 1)"; //(uiActive ? "rgba(255, 255, 255, 1)" : "rgba(255, 255, 255, 0.7)");
					ctx.fillText(text, textpos.x + 20, (textpos.y)|0);

					
					ctx.stroke();
					
					ctx.restore();
				}
				
				ctx.restore();	// End y-origin translate.
				
				// Time label stuff.
				
				ctx.fillStyle = "rgba(100, 100, 100, 1)";
				ctx.textAlign = "left";

				if (uiActive) {
					ctx.save();
					
					// Rotation option... trade-offs with occluding the value labels and x-axis...
					// Consider using the title area e.g. "Memory usage @ 11:32...)
					//ctx.translate(x - 5 + (x < 30 ? 30 : 0), $canvas.height);
					//ctx.rotate(-90 * Math.PI/180);
					
					ctx.translate(x - (!timeLabelToRight ? tWidth + 10 : -10), $canvas.height);
					
					ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
					ctx.fillRect(0, -15, tWidth, 15);
					
					ctx.fillStyle = "#fff";
					ctx.fillText(timeText, 5, -lgdFontSize/2);
					
					ctx.restore();
				}
				
				
					
				if (tmrUIAnim !== null) {
					window.cancelAnimationFrame(tmrUIAnim);
					tmrUIAnim = null;
				}
				
				if (uiActive) {
					tmrUIAnim = window.requestAnimationFrame(drawUILayer);
				}
			};
			
			var uiActive = false;
			var mouseDown = false;
			
			// Update only while mouse-overed. Optimization, so can be a source of bugs. 
			var tmrUIAnim = null;
			
			$canvasUI.onmouseover = function () {
				if (tmrUIAnim !== null) {
					window.cancelAnimationFrame(tmrUIAnim);
				}
				uiActive = true;
				tmrUIAnim = window.requestAnimationFrame(drawUILayer);
			}
			$canvasUI.onmouseout = function () {
				uiActive = false;
				drawUILayer();	// Clears it. 
			}
			
			$canvasUI.onmousedown = function () {
				mouseDown = true;
			}
			
			$canvasUI.onmouseup = function () {
				mouseDown = false;
			}
			
			
			var parseOptions = function (options) {
				opts = {};
				for (var k in defaults) {
					opts[k] = defaults[k];
				}
				
				if (typeof options === "undefined") {
					return;
				}
				
				if (typeof options !== "object") {
					console.warn("Options ignored - must be an object.");
					return;
				}

				for (var k in options) {
					if (typeof defaults[k] === "undefined") {
						console.warn("Option '"+k+"' not recognized - ignoring.");
						continue;
					}
					opts[k] = options[k];
				}
			}
			
			var drawAll = function () {	
				xres = xrange / ($canvas.width - valueBarWidth);		// Seconds per pixel
				pixelsPerSec = 1/xres;
				drawIval = Math.min(Math.max((1000 / pixelsPerSec)/2, 30), 10000);
				
				pixelsTranslated = 0;
				pixelRem = 0;
				
				drawUpdate();
			}
			
			var setup = function () {

				parseOptions(options);
			
				var xstats = arrayStats(xvals);
				xrange = xstats.max;

				if (typeof opts['range'] === "number") {
					xrange = opts['range']*1;
				}
				
				if (!xrange) {
					console.warn("Invalid or no x-range; initialising to default.");
					xrange = 30;
				}


				// TODO: For log scale, formatter and scaler are defined in drawSeries...
				// Refactor...
				yscale = function (y) {
					if (ymax - ymin === 0) {
						return 0;
					}
					return y * ($canvas.height / (ymax - ymin));
				}

				formatter = function (y) {
					if (!y && y !== 0) {
						return false;
					}
					
					formatter.numberFormat = formatter.numberFormat || new Intl.NumberFormat('en-US', {minimumSignificantDigits: 3, maximumSignificantDigits: 3});
					
					var order = 3;
					var suff = ['a', 'f', 'p', 'n', 'μ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E'];
					
					if (y === 0) {
						return '0 ';
					}
					
					var mag = Math.floor(Mlog(Math.abs(y)||1) + 0.01) + 1;	// 0.01 creates some slop, e.g. 1000 => 3, 980 => 3, 970 => 2

					var num = y/Mpow(Math.floor(((mag-1)/order))*order)
					var numstr = formatter.numberFormat.format(num)		//.toLocaleString({}, ); is slow.

					var suffidx = Math.ceil(mag/order)+5;
					
					if (suffidx < 0) {
						return '~0 ';
					}

					return numstr + ' ' + suff[suffidx];
				};
				
				if (opts['format'] === 'exp') {
					formatter = function (y) {
						if (!y && y !== 0) {
							return false;
						}
						return y.toExponential(2).toUpperCase().replace(/\+/, '').replace(/E0/, '');
					}
				}
				
				if (typeof opts['format'] === 'function') {
					formatter = opts['format'];
				}
				
				valueBarWidth = 60;

				if (opts['yaxis'] === 'none') {
					valueBarWidth = 0;
				}
				
				t0 = 0;
				
				drawAll();
			};

			if (options && options.debug) {
				console.log("DEBUGGING");
			}
			
			setup();
			
			var chart = {
				update: function (vals) {
					if (!Array.isArray(vals)) {
						vals = arguments;
					}
					
					for (var k = 0; k < vals.length; k++) {
						if (typeof vals[k] === "undefined") {
							console.warn("Undefined value at index "+k);
							continue;
						}
						
						if (typeof data[k] === "undefined") {
							console.warn("Unknown metric at "+k);
							continue;
						}
						
						curVals[k] = vals[k]*1;
						
						if (typeof opts['multipliers'][k] === "number") {
							curVals[k] *= opts['multipliers'][k]*1;
						}
						
						if (data[k][data[k].length-1] !== curVals[k]) {
							curValsChanged = true;
						}
						
						if (typeof curValSums[k] === "undefined") {
							curValSums[k] = 0;
							curValCnts[k] = 0;
						}
						
						curValSums[k] += curVals[k];
						curValCnts[k] ++;
						
						// TODO: If curVal is out of range ymin-ymax, then 
						// call drawSeries() as well to re-scale the chart.
					}
					
					tdLastUpdate = td;
					
					if (tmrAnim !== null) {
						// This is a "secondary" user of this timer.
						// If the main drawUpdate() has a frame pending, 
						// we just let that one execute. 
						return;
					}
					tmrAnim = window.requestAnimationFrame(function () {
						//console.log("UPDATE", curVals);
						drawCurVals();
						drawYAxis();
						drawUILayer();
						
						tmrAnim = null;
					});

				},
				stop: function () {
					if (tmrUpdate !== null) {
						window.clearTimeout(tmrUpdate);
						tmrUpdate = null;
					}
					// Stop
				},
				setup: function (newOpts) {
					options = newOpts;
					setup();
				},
				getData: function () {
					return [xvals, data];
				}
			};
			
			$container.hrts = chart;
			
			return chart;
		}
	};
})();

if (window['HrtsReady']) {
	if (Array.isArray(window['HrtsReady'])) {
		window['HrtsReady'].forEach(function (x) {
			x();
		});
	}
	else {
		window['HrtsReady']();
	}
}


