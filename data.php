<?php
  $data = explode("\n", file_get_contents('data.txt'));
  array_pop($data);
  $seed = $_GET['seed'];
  
  $rtn = preg_grep("/$seed/", $data);
  
  echo '[' . implode(",\n", $rtn) . ']';
?>
