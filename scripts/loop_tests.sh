#!/bin/sh
# Execute 10 times the yarn test -g command
COUNT=0
for i in {1..100}
do
  yarn test -g ConsoleTest.rotateKeys
  if [ $? -eq 0 ]
  then
    COUNT=$((COUNT+1))
    echo "Test passed"
  else
    echo "Test failed"
    echo "Worked $COUNT times" 
    exit 1
  fi
done

echo "Worked $COUNT times"
