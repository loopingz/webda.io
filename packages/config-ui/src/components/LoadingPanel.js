import CircularProgress from '@material-ui/core/CircularProgress';

const LoadingPanel = ({ loading, children }) => {
    return (
        <div>
            {loading.syncing ? (
                <div style={{
                    alignItems: "center",
                    justifyContent: "center",
                    display: "flex",
                    minHeight: "100vh",
                    width: "100vw"
                }}>
                    <CircularProgress color="primary" />
                </div>
            ) : (
                    { ...children }
                )}
        </div>
    )
}

export default LoadingPanel;