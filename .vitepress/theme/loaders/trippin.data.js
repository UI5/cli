export default {
    async load() {
        // fetch remote data
        const service = 'https://services.odata.org/Trippin_Staging/(S(iw1anra4xygjyssbeef0yeyy))'
        return (await fetch(`${service}/People?$select=FirstName,LastName,UserName&$orderBy=LastName,FirstName&$top=100`)).json()
    }
}