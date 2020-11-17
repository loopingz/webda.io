import { makeStyles } from '@material-ui/core/styles';
import { homeStyles } from "../styles/Styles";

const useStyles = makeStyles(homeStyles);

const App = () => {
  const classes = useStyles();
  return (
    <div className={classes.container}>
      <header>
        <p>
          Welcome to the new Webda config UI
        </p>
      </header>
    </div>
  );
}

export default App;
