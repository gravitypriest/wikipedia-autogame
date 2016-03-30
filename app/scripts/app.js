'use strict';

angular
    .module('wikipediaTrumpApp', [])
    .controller('MainCtrl', function($scope, $http) {
        $scope.Mode = {
            START:1,
            INPROGRESS:2,
            FOUND:3,
        };
        $scope.currentMode = $scope.Mode.START;
        $scope.finalPath = [];
        $scope.badLink = false;
        $scope.noExistError = false;
        $scope.maxDepthError = false;
        $scope.someError = false;

        $scope.resetPage = function() {
            $scope.badLink = false;
            $scope.currentMode = $scope.Mode.START;
            $scope.finalPath = [];
        };

        $scope.generatePathObj= function(path) {
            var out = [];
            for (var s in path) {
                out.push({
                    'title':path[s],
                    'link':encodeURI('https://en.wikipedia.org/wiki/' + path[s].replace(/ /g, '_'))
                });
            }
            return out;
        };

        $scope.clearError = function() {
            $scope.badLink = false;
            $scope.noExistError = false;
            $scope.maxDepthError = false;
            $scope.someError = false;
        };

        $scope.parseTitle = function(url) {
            var wikiRgx = /(?:https*\:\/\/)*en\.wikipedia\.org\/wiki\/([^\|]+)/i;
            var goodLink = url.match(wikiRgx);
            if (goodLink) {
                var title = goodLink[1];
                return title;
            } else {
                return url;
            }
        };

        $scope.fetchWikiPath = function(url) {
            $scope.clearError();
            var params = {};
            if (url !== undefined && url !== null && url !== '') {
                var decodedLink = decodeURI(url);
                var title = $scope.parseTitle(decodedLink);
                if (title) {
                    params = {
                        'start':title
                    };
                } else {
                    $scope.badLink = true;
                    return;
                }
            }

            $scope.currentMode = $scope.Mode.INPROGRESS;

            $http({
                method: 'GET',
                url: '/find',
                params:params
            }).then(function successCallback(response) {
                var path = response.data;
                if (path.length > 0) {
                    if (path[0] === 'NO_EXIST_ERROR') {
                        $scope.currentMode = $scope.Mode.START;
                        $scope.noExistError = true;
                    } else if (path[0] === 'MAX_DEPTH_ERROR') {
                        $scope.currentMode = $scope.Mode.START;
                        $scope.maxDepthError = true;
                    } else {
                        $scope.finalPath = $scope.generatePathObj(path);
                        $scope.currentMode = $scope.Mode.FOUND;
                    }
                }
            }, function errorCallback(response) {
                $scope.currentMode = $scope.Mode.START;
                $scope.someError = true;
            });
        };
    });
