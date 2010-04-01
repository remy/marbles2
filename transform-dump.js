// required to normalise the "normal" animation props
function withPX(s) {
  s = (s+'').replace(rtrim, ''); // clean out white space
  if (s.substr(-2) != 'px') {
    s += 'px';
  }

  return s;
}

function relative(s) {
  s += '';
  if (s.substr(0, 1) == '-') {
    s = '-=' + s.substr(1);
  } else {
    s = '+=' + s.substr(1);
  }

  return s;
}



// convert move & scale to appropriate CSS styles
for (i in css) {
  if (i == 'move') {
    flaggedTranlate = true;
    x = css[i].x;
    y = css[i].y;

    if ($.support.transforms) {
      transform.push('translate(' + withPX(x) + ',' + withPX(y) + ')');
    } else {
      // Relative if the values are already set
      if (css.left) {
        css.left = parseInt(css.left); // just to be safe
        x = parseInt(x);
        if (x < 0) {
          css.left -= x;
        } else {
          css.left += x;
        }
      } else {
        css.left = relative(withPX(x)); // left == x         
      }

      if (css.top) {
        css.top = parseInt(css.top);
        y = parseInt(y);
        if (y < 0) {
          css.top -= y;
        } else {
          css.top += y;
        }
      } else {
        css.top = relative(withPX(y)); // top == y
      }
    }
  } else if (i == 'scale') {
    if ($.support.transforms) {
      flaggedScaling = true;
      transform.push('scale(' + css[i].x + ',' + css[i].y + ')');
    } else {
      // privately scopped to make the calculations easier
      (function () {
        x = css[i].x;
        y = css[i].y;

        // sanitise - no longer required yay!
        // x = parseInt(x);
        // y = parseInt(y);

        var h = parseInt($el.height()), 
            w = parseInt($el.width()),
            dims = $el.offset(),
            tw = (w * x),
            th = (h * y), 
            tl = dims.left - ((tw - w) / x),
            tt = dims.top - ((th - h) / y);

        // ghost to keep the flow of the doc correct
        var $clone = $el.clone();
        $el.after($clone.css('visibility', 'hidden'));
        $el.css('position', 'absolute');

        css.height = th;
        css.width = tw;
        css.top = tt;
        css.left = tl;
      })();
    }
  }
}
