(function ($) {
var down,
    touchSupport = $.touch;
    
document.body.ontouchmove = function (event) {
  var over;

  if (down !== false) {
    over = document.elementFromPoint(event.targetTouches[0].pageX, event.targetTouches[0].pageY);
    
    if (over && !elementIn(over, down[0]) && over !== down[0]) {
      down.fire('touchout');
      down.removeClass('active');
    } else {
      down.fire('touchin');
      down.addClass('active');
    }
  }

  // just to be sure
  event.preventDefault();
  event.stopPropagation();
  return false;
};

function elementIn(element, context) {
  do {
    if (element === context) return true;
  } while (element = element.parentNode);
  return false;
}

$.fn.touch = function (fn) {
  return touchSupport ? this.on('touchstart', function () {
    down = $(this).addClass('active');
    down.fire('touchin');
  }).on('touchend', function (event) {
    down.removeClass('active');
    down = false;

    var over = document.elementFromPoint(event.changedTouches[0].pageX, event.changedTouches[0].pageY);
    if (over === this || elementIn(over, this)) {
      fn.call(this, event);
    }
  }) : this.on('mousedown', function () {
    down = $(this).addClass('active');
    down.fire('touchin');
  }).on('mouseup', function (event) {
    down.removeClass('active');
    down = false;

    var over = document.elementFromPoint(event.pageX, event.pageY);
    if (over === this || elementIn(over, this)) {
      fn.call(this, event);
    }
  });
};

$.fn.touchClick = function (fn) {
  return this.on('touchstart', fn).on('click', fn);
};

$.fn.oneTouchClick = function (fn) {
  // console.log('bind');
  var cb = function () {
    // console.log('removing from', this, this._xuiEventID);
    $(this).un('touchstart', cb).un('click', cb);
    fn.apply(this, arguments);
  }
  this.on('touchstart', cb).on('click', cb);
  // console.log(this[0]._xuiEventID);
};
  
})(xui);
