(function ($, window, undefined) {

var m = document.createElement('i'),
    m_style = m.style,
    // TODO support other browsers easings - based on Safari's easing options and ported to Emile easing.
    stanardEasing = {
      'ease-in-out' : function(pos){if((pos/=0.5)<1){return 0.5*Math.pow(pos,4);}return -0.5*((pos-=2)*Math.pow(pos,3)-2);},
      'ease-in' : function(pos){return Math.pow(pos,4);},
      'ease-out' : function(pos){return Math.pow(pos,0.25);},
      'linear': function (i) {return i;}
    };


function prep_properties( prop, value, css ) {
  var uc_prop = prop.charAt(0).toUpperCase() + prop.substr(1);
  
  if (css === undefined) css = {};
      
  [
    prop,
    'Webkit' + uc_prop,
    'Moz' + uc_prop,
    'O' + uc_prop,
    'ms' + uc_prop
  ].forEach(function (item) {
    css[item] = value;
  });

  return css;
}

// taken and simplified from Modernizr - http://modernizr.com
function test_props_all( prop, callback ) {
  var uc_prop = prop.charAt(0).toUpperCase() + prop.substr(1),
  props = [
    prop,
    'Webkit' + uc_prop,
    'Moz' + uc_prop,
    'O' + uc_prop,
    'ms' + uc_prop
  ];

  return !!test_props( props, callback );
}


function test_props( props, callback ) {
  for ( var i in props ) {
    if ( m_style[ props[i] ] !== undefined && ( !callback || callback( props[i] ) ) ) {
      return true;
    }
  }
}

function testTransitions() {
  return !!test_props_all('transitionProperty');
}

if ($.support == undefined) $.support = {};
$.support.transitions = testTransitions();

$.fn._tween = $.fn.tween;

$.fn.tween = function(css, options, callback) {
	if (typeof options == 'function') {
	  callback = options;
	  options = {};
	} else if (typeof options == 'number') {
	  options = { duration: options };
	}

	if (options.duration === undefined) {
	  options.duration = 200;
	}
	if (options.easing === undefined) {
	  options.easing = 'ease-in';
	}
		
  if (options.duration === 0) { // differentiate 0 from null
    this.css(css);
    if (options.callback) {
      window.setTimeout(options.callback, 0);
    }
    return this;
  } else {
    return this.each(function () {
      var $el = $(this),
          transitionCSS = {};
          
      if ($.support.transitions) {
        // ? moz equivelent? should we just have a timer to run the callback?
        transitionCSS = prep_properties('TransitionProperty', 'all');
        transitionCSS = prep_properties('TransitionDuration', options.duration + 'ms', transitionCSS);
        transitionCSS = prep_properties('TransitionTimingFunction', options.easing, transitionCSS);

        if (options.callback) {
          var callback = function (eventType) {
            return function () {
              options.callback();
              this.removeEventListener(eventType, arguments.callee, false);
            };
          };
          
          // trigger once
          for (eventType in prep_properties('TransitionEnd', null)) {
            eventType = eventType.replace(/^(.)/, function (m) { return m.toLowerCase(); });
            this.addEventListener(eventType, callback(eventType), false);
          }
          
        }
        $el.css(transitionCSS);

        setTimeout(function (el) { 
          el.css(css);
        }, 0, $el);
        
      } else { // use animated tweening
        if (options.easing) options.easing = stanardEasing[options.easing];
        $el._tween(css, options, options.callback);
      }
    });
  }
};
  
})(xui, this);
