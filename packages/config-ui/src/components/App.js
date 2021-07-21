import { useState } from "react";
import { makeStyles } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';

import ServicesPanel from './tabPanels/ServicesPanel';
import { Switch, Route, BrowserRouter } from 'react-router-dom';

import { useSelector } from 'react-redux';

import AppBarComponent from './AppBar';
import DrawerComponent from './Drawer';

const useStyles = makeStyles((theme) => ({
    root: {
        display: 'flex',
        minHeight: '100vh'
    },
    content: {
        flexGrow: 1,
        paddingTop: 64
    },
    nav: {
        minHeight: 'calc(100vh - 64px)'
    }
}));

const App = () => {
    const classes = useStyles();
    const [open, setOpen] = useState(false);
    const handleDrawerOpen = () => {
        setOpen(true);
    };
    const handleDrawerClose = () => {
        setOpen(false);
    };
    const services = useSelector(state => state.rootReducer.config.configuration.services);
    return (
        <div className={classes.root}>
            <CssBaseline />
            <AppBarComponent open={open} handleDrawerOpen={handleDrawerOpen} />
            <BrowserRouter>
                <nav className={classes.nav}>
                    <DrawerComponent open={open} handleDrawerClose={handleDrawerClose} />
                </nav>
                <main className={classes.content}>
                    <Switch>
                        <Route path="/services" render={() => <ServicesPanel services={services} />} />
                        <Route path="/configuration" render={() => <div>Page configuration</div>} />
                    </Switch>
                </main>
            </BrowserRouter>
        </div>
    )
}

export default App;