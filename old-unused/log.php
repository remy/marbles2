<?php
if (@$_POST['data']) {
  header('Access-Control-Allow-Origin: *');  
  $fp = fopen('data.txt', 'a+');
  fwrite($fp, '{"date":"' . date('c', time()) . '","data":' . $_POST['data'] . ',"source":"' . $_SERVER['HTTP_ORIGIN'] . '","ip":"' . $_SERVER['REMOTE_ADDR'] . '"' . "}\n");
  fclose($fp);
}
?>
