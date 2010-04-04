if (!window.JSON) JSON = {
  parse: function (s) {
    var d;
    eval('d = ' + s);
    return d;
  },
  stringify: function (o) {
    var string = '', parts = [], type = o.toString();
    if (type == '[object Object]') {
      for (var k in o) {
        parts.push('"' + k + '"' + ':' + JSON.stringify(o[k]));
      }
      string = '{' + parts.join(',') + '}';
    } else if (o instanceof Array) {
      for (k = 0; k < o.length; k++) {
        parts.push(JSON.stringify(o[k]));
      }
      string = '[' + parts.join(',') + ']';
    } else if (typeof o == 'string') {
      string = '"' + o.replace(/[\n"]/, function (m) { return { '\n' : '\\n', '"' : '\\"'}; }) + '"';
    } else {
      string = o.toString();
    } 
    return string;
  }
};

if (!window.localStorage || !window.sessionStorage) (function () {

var Storage = function (type) {
  function createCookie(name, value, days) {
    var date, expires;

    if (days) {
      date = new Date();
      date.setTime(date.getTime()+(days*24*60*60*1000));
      expires = "; expires="+date.toGMTString();
    } else {
      expires = "";
    }
    document.cookie = name+"="+value+expires+"; path=/";
  }

  function readCookie(name) {
    var nameEQ = name + "=",
        ca = document.cookie.split(';'),
        i, c;

    for (i=0; i < ca.length; i++) {
      c = ca[i];
      while (c.charAt(0)==' ') {
        c = c.substring(1,c.length);
      }

      if (c.indexOf(nameEQ) == 0) {
        return c.substring(nameEQ.length,c.length);
      }
    }
    return null;
  }
  
  function setData(data) {
    data = JSON.stringify(data);
    if (type == 'session') {
      window.top.name = data;
    } else {
      createCookie('localStorage', data, 365);
    }
  }
  
  function clearData() {
    if (type == 'session') {
      window.top.name = '';
    } else {
      createCookie('localStorage', '', 365);
    }
  }
  
  function getData() {
    var data = type == 'session' ? window.top.name : readCookie('localStorage');
    return data ? JSON.parse(data) : {};
  }


  // initialise if there's already data
  var data = getData();

  return {
    clear: function () {
      data = {};
      clearData();
    },
    getItem: function (key) {
      return data[key] || null;
    },
    key: function (i) {
      // not perfect, but works
      var ctr = 0;
      for (var k in data) {
        if (ctr == i) return k;
        else ctr++;
      }
      return null;
    },
    removeItem: function (key) {
      delete data[key];
      setData(data);
    },
    setItem: function (key, value) {
      data[key] = value+''; // forces the value to a string
      setData(data);
    }
  };
};

if (!window.localStorage) window.localStorage = new Storage('local');
if (!window.sessionStorage) window.sessionStorage = new Storage('session');

})();